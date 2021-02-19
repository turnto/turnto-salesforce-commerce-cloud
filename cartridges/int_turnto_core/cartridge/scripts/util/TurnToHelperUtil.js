/**
* This script serves as utility helper to use throughout the TurnTo logic
*
* To use specify the global variable TurnToHelper then a dot then the function name (e.g. TurnToHelper().isValid() )
*
*/

/* API Includes */
var ContentMgr = require('dw/content/ContentMgr');
var Cookie = require('dw/web/Cookie');
var Resource = require('dw/web/Resource');
var Site = require('dw/system/Site');
var StringUtils = require('dw/util/StringUtils');
var System = require('dw/system/System');
var CatalogMgr = require('dw/catalog/CatalogMgr');
var Category = require('dw/catalog/Category');
var Cipher = require('dw/crypto/Cipher');
var Calendar = require('dw/util/Calendar');
var Bytes = require("dw/util/Bytes");
var Encoding = require("dw/crypto/Encoding");
var MessageDigest = require("dw/crypto/MessageDigest");
var Transaction = require('dw/system/Transaction');
var ProductInventoryMgr = require("dw/catalog/ProductInventoryMgr");
var Logger = require('dw/system/Logger');
var crypto = require('dw/crypto');

var TurnToHelper = {
		
	/**
	 * @function
	 * @name getLocalizedTurnToPreferenceValue
	 * @param preferenceName The name of the localized TurnTo SitePreference to retrieve
	 * @param locale The locale in which to retrieve a value. If not matching locale is returned, the default is used
	 * @return {String} The localized value of the Site Preference specified by the preferenceName parameter
	 */
	getLocalizedTurnToPreferenceValue: function( preferenceName, locale ) {
		var localizedValues : dw.util.Collection = Site.getCurrent().getCustomPreferenceValue( preferenceName );
		var preferenceValue : String = null;
		for each( var entry : String in localizedValues ) {
			var entryLocale : String = entry.split( ":" )[0];
			var entryValue : String = entry.split( ":" )[1];
			if( entryLocale == locale ) {
				preferenceValue = entryValue;
				break;
			} else if( entryLocale == 'default' && preferenceValue == null ) {
				preferenceValue = entryValue;
			}
		}
		return preferenceValue;
	},
	
	/**
	 * @function
	 * @name getLocalizedSitePreferenceFromRequestLocale
	 * @param preferenceName The name of the localized TurnTo SitePreference to retrieve
	 * @return {String} The localized value of the Site Preference specified by the preferenceName parameter
	 */
	getLocalizedSitePreferenceFromRequestLocale: function( preferenceName ) {
		return TurnToHelper.getLocalizedTurnToPreferenceValue(preferenceName, request.locale);
	},
	
	/**
	 * @function
	 * @name getURLSitePreference
	 * @return {String} the URL site preference
	 */
	getURLSitePreference: function() {
		return Site.getCurrent().getCustomPreferenceValue('turntoURL');
	},
	
	/**
	 * @function
	 * @name getAllowedLocales
	 * @description retrieve the allowed lcoales per site
	 * @returns {List} allowed locales
	 */
	getAllowedLocales: function() {
		//loop through site enabled locales to generate a catalog export for each locale
		return Site.getCurrent().getAllowedLocales();
	},

	/**
	 * @function
	 * @name replaceNull
	 * @description Replaces null with the specified replacement string.
	 * @param {String} The string to replace if null
	 * @param {String} The string to use as a replacement
	 * @returns {String} - replace if str is null, otherwise str
	 */
	replaceNull: function(str, replace) {
		return (str != null) ? str : replace;	
	},
	
	/**
	 * @function
	 * @name computeSignature
	 * @description Computes the signature for the TurnTo Request
	 * @param {Array} obj - array of the user status object
	 * @returns {Object} signature
	 */
	computeSignature: function (obj) {
		//Flatten anything in the "profile_attributes" element into top level attributes
		//Sort the attributes alphabetically
		//convert array into query string
		var queryString = Object.keys(obj).map(function(key) {
			return key + '=' + obj[key]
		}).join('&');
		
		//encode query string
		encodeURIComponent(queryString)
		
		//retrieve the TurnTo auth key to use for encryption
		var turntoAuthKey = Site.getCurrent().getCustomPreferenceValue('turntoAuthKey');
		
		//create HMAC
		var mac = new crypto.Mac(crypto.Mac.HMAC_SHA_256);
		
		//return base64 encoded string
		return crypto.Encoding.toBase64(mac.digest(queryString, turntoAuthKey));
	},

	/**
	 * @function
	 * @name buildUserInfoObject
	 * @description Creates the user info object and then computes the signature from the created object
	 * @param {Profile} profile of current user
	 * @returns {Object} profile attributes and the signature created from the attributes
	 */
	buildUserInfoObject: function (profile) {
		var data = {
			    'email': profile.email,
			    'email_confirmed': true,
			    'first_name': profile.firstName,
			    'issued_at': Date.now(),
			    'last_name': profile.lastName,
			    'nickname': profile.firstName,
			    'user_auth_token': session.sessionID
		};
		
		data['signature'] = TurnToHelper.computeSignature(data);

		return data;
	},
	
	/**
	 * @function
	 * @name isRestrectedByCountry
	 * @description Check if feature might be restricted by user country
	 * @returns {boolean} true or false
	 */
	isRestrictedByCountry: function () {
		var geolocation = request.geolocation;
		var restrictedCountries = Site.getCurrent().getCustomPreferenceValue('turntoCountryRestriction');
		return geolocation.available && restrictedCountries.indexOf(geolocation.countryCode) >= 0;
	},
	
	/**
	 * @function
	 * @name isPostingContentEnabled
	 * @description Check if posting content enabled (Geo Restriction Feature)
	 * @returns {boolean} true or false
	 */
	isPostingContentDisabled: function () {
		var disablePostingOfContent = Site.getCurrent().getCustomPreferenceValue('turnToDisablePostOfContent');
		return disablePostingOfContent && this.isRestrictedByCountry();
	},
	
	/**
	 * @function
	 * @name isMobileLandingPageEnabled
	 * @description Check if mobile landing page enabled (Geo Restriction Feature)
	 * @returns {boolean} true or false
	 */
	isMobileLandingPageDisabled: function () {
		var disableMobileLandingPage = Site.getCurrent().getCustomPreferenceValue('turnToDisableMobilLandingPage');
		return disableMobileLandingPage && this.isRestrictedByCountry();
	},
	
	/**
	 * @function
	 * @name isSSOEnabled
	 * @description Check if Single sign on is enabled (Geo Restriction Feature)
	 * @returns {boolean} true or false
	 */
	isSSOEnabled: function () {
		var generalSSOEnabled = Site.getCurrent().getCustomPreferenceValue('turnToSSOEnable');
		if (!generalSSOEnabled) {
			return generalSSOEnabled;
		}
		
		var disabledSSObyGeoRestriction = Site.getCurrent().getCustomPreferenceValue('turnToDisableSSO');
		if (!disabledSSObyGeoRestriction) {
			return generalSSOEnabled;
		} else {
			if (this.isRestrictedByCountry()) {
				return false;
			} else {
				return true;
			}
		}
	}
}

module.exports = TurnToHelper;
