/**
* This script serves as utility helper to use throughout the TurnTo logic
*
* To use specify the global variable TurnToHelper then a dot then the function name (e.g. TurnToHelper().getLocalizedTurnToPreferenceValue() )
*
*/

/* API Includes */
var Site = require('dw/system/Site');
var System = require('dw/system/System');
var HashMap = require('dw/util/HashMap');
var Logger = require('dw/system/Logger');
var ProductMgr = require('dw/catalog/ProductMgr');

var TurnToHelper = {
	
	/**
	 * @function
	 * @name getProductSku
	 * @param lookup_id the id of the product we're fetching the sku for (may just be returned without modification)
	 * @return {String} The SKU value TurnTo uses to identify the product
	 *
	 * @description This function returns either:
	 *		(a): If "turnToUseVariants" is "Yes", return the id passed in the lookup_id parameter
	 *		(b): If "turnToUseVariants" is "No", call getParentSku
	 *			getParentSku will either:
	 *				(a): If the product ID belongs to a parent product, it returns the value back
	 *				(b): If the product ID belongs to a variant product, it returns the products' parent's SKU
	 */
	getProductSku: function (lookup_id) {
		var useVariants : Boolean = Boolean(Site.getCurrent().getCustomPreferenceValue('turntoUseVariants'));

		if (useVariants) {
			product_sku = lookup_id;
		} else {
			product_sku = TurnToHelper.getParentSku(lookup_id);
		}
		
		return product_sku;
	},
		
	/**
	 * @function
	 * @name getParentSku
	 * @param lookup_id the id of the product we're fetching the sku for (may just be returned without modification)
	 * @return {String} The SKU value TurnTo uses to identify the parent product
	 *
	 * @description	This function returns either:
	 *		(a): If the product ID belongs to a parent product, it returns the value back
	 *		(b): If the product ID belongs to a variant product, it returns the products' parent's SKU
	 */
	getParentSku: function(lookup_id) {
		
	    var product = ProductMgr.getProduct(lookup_id)
	    
		if(!product.isMaster()) {
			var product_id = product.getMasterProduct().getID();
		} else {
			var product_id = lookup_id;
		}
		
		return product_id;
	},
		
	/**
	 * @function
	 * @name getLocalizedTurnToPreferenceValue
	 * @param locale The locale in which to retrieve a value. If not matching locale is returned, the default is used
	 * @return {String} An array containing the "turntoSiteKey", "turntoAuthKey", and "domain" values of the TurnTo preferences for the given locale
	 *
	 * @description This function returns the Site Key, Auth Key, and Domain preferences for the given locale
	 */
	getLocalizedTurnToPreferenceValue: function(locale) {
		
		var preferenceArray = {};
		var hashMapOfKeys = TurnToHelper.getHashMapOfKeys();
		try {
			hashMapOfKeys.entrySet().forEach(function (obj) {
				// Check if the TurnTo preferences JSON contains the given locale
				if (obj.value.locales.indexOf(locale) != -1) {
					// IF FOUND return the preference values for the given locale
					preferenceArray = {
							turntoSiteKey: JSON.parse(obj.key),
							turntoAuthKey: obj.value.authKey,
							domain: obj.value.domain || TurnToHelper.getDefaultDataCenterUrl()
					};
				}
			});
		} catch (e) {
			TurnToHelper.getLogger().error('TurnToHelperUtil.js error:' + e.message);
		}
		
		return preferenceArray;
	},
	
	/**
	 * @function
	 * @name getLocalizedSitePreferenceFromRequestLocale
	 * @return {String} The localized value of the Site Preference specified by the preferenceName parameter
	 */
	getLocalizedSitePreferenceFromRequestLocale: function() {
		// Grab the preferences for the request locale
		// request.locale should return the locale as determined by the site setting
		return TurnToHelper.getLocalizedTurnToPreferenceValue(request.locale);
	},
	
	/**
	 * @function
	 * @name hasSiteAndAuthKeyPerLocale
	 * @param locale The locale in which to check if a site and auth key exists
	 * @return {Boolean} true if the locale contains both auth and site keys; false if it does not contain an auth key, site key or both
	 */
	hasSiteAndAuthKeyPerLocale: function(locale) {
		var hashMapOfKeys = TurnToHelper.getHashMapOfKeys();
	
		try {
			hashMapOfKeys.entrySet().forEach(function () {
				if (obj.value.locales.indexOf(locale) != -1 && 'authKey' in obj.value && obj.value.authKey) {
					return true;
				}
			});
		} catch (e) {
			TurnToHelper.getLogger().error('TurnToHelperUtil.js error:' + e.message);
		}

		return false;
	},
	
	/**
	 * @function
	 * @name getAllowedLocales
	 * @returns {List} allowed locales
	 *
	 * @description retrieve the allowed locales per site that contain both a site and auth key
	 */
	getAllowedLocales: function() {
		// Get the locales for the current site
		var siteAllowedLocales = Site.getCurrent().getAllowedLocales();
		var adjustedAllowedLocales = [];
		
		//loop through site enabled locales..
		siteAllowedLocales.forEach(function () {
			//If turntoAuthKey and turntoSiteKey values are not defined for a particular locale the job should skip the locale.
			if(TurnToHelper.hasSiteAndAuthKeyPerLocale(locale)) {
				adjustedAllowedLocales.push(locale);
			}
		});
		
		return adjustedAllowedLocales;
	},

	/**
	 * @function
	 * @name replaceNull
	 * @param {String} str The string to replace if null
	 * @param {String} replace The string to use as a replacement
	 * @returns {String} - replace if str is null, otherwise str
	 *
	 * @description Replaces null with the specified replacement string.
	 */
	replaceNull: function(str, replace) {
		return (!empty(str)) ? str : replace;	
	},

	/**
	 * @function
	 * @name getHashMapOfKeys
	 * @returns {String} - Return map of TurnTo keys with locales, authKey
	 *
	 * @description Function to get map of TurnTo keys with locales, authKey from custom prefernce
	 */
	getHashMapOfKeys: function () {
		// Get the TurnTo JSON for the current site
		var TurnToSiteAuthKey = Site.getCurrent().getCustomPreferenceValue('TurnToSiteAuthKeyJSON');
		// Split by line/tab
		var rg = new RegExp('(\n|\t)', 'gm');
		var result = JSON.parse(TurnToSiteAuthKey.replace(rg, ''));
		// Loop through each line in the JSON and insert the KEY:VALUE pair into the hash map
		var hashMapOfKeys = new HashMap();
		for (var key in result) {
			hashMapOfKeys.put(JSON.stringify(key), result[key]);
		}
		return hashMapOfKeys;
	},

	/**
	 * @function
	 * @name getPageID
	 * @returns {string} page ID
	 *
	 * @description This function does it's best to determine what the TurnTo-defined pageID should be.
	 * 		For example, if the page's URL
	 */
	getPageID: function () {
		var pageID = '';
		var currentPage = request.httpPath;

		//NOTE: these can be modified if you need more or less defined page IDs
		//if you do modify the following switch cases then make sure you adjust the conditional statements in 'htmlHeadIncludeJS.isml'
		//also new page IDs will need to be added to the TurnTo system in order for features to work, reach out to your TurnTo representative
		if (currentPage.indexOf('Product') > -1) {
			pageID = 'pdp-page';
		} else if (currentPage.indexOf('Confirm') > -1 || currentPage.indexOf('Submit') > -1) {
			pageID = 'order-confirmation-page';
		} else if (currentPage.indexOf('Search') > -1) {
			pageID = 'search-page';
		} else if (currentPage.indexOf('Page') > -1) {
			// Special case here as this could be any content page as well.
			if ( Site.getCurrent().getCustomPreferenceValue('turntoVCPinboardEnabled')) {
				pageID = 'pinboard-page';
			} else {
				pageID = 'non-defined-page';
			}			
		} else {
			pageID = 'non-defined-page';
		}
		
		return pageID
	},
	
	/**
	 * @function
	 * @name getDefaultDataCenterUrl
	 * @return {String} The value of the "defaultDataCenterUrl" configuration for the current site
	 */
	getDefaultDataCenterUrl: function () {
		return Site.getCurrent().getCustomPreferenceValue('defaultDataCenterUrl');
	},

	/**
	 * @name getLogger
	 * @desc returns the logger
	 */
	getLogger: function () {
		return Logger.getLogger('int_core_turnto_core_v5');
	},

	/**
	 * @name getTurnToStarClass
	 * @param {String} presentationID
	 *
	 * @description This function is used during listing page filtering. It takes in the selected filter and outputs the class associated with the appropriate TurnTo rating.
	 */
	getTurnToStarClass: function (presentationID) {
		var turntoStarClass = '';

		if (!empty(presentationID)) {
			turntoStarClass = 'TTratingBox TTrating-' + presentationID;
		}
		return turntoStarClass;
	}
}

module.exports = TurnToHelper;

