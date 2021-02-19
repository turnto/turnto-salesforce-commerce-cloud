'use strict';

/**
 *   Name: ServiceFactory
 */

/* API Modules */
var Logger = require('dw/system/Logger');
var File = require('dw/io/File');
var ProductMgr = require('dw/catalog/ProductMgr');

/*Script Modules*/
var TurnToHelper = require('*/cartridge/scripts/util/TurnToHelperUtil');

// Public
var ServiceFactory = {

	// Service IDs
	SERVICES: {
		IMPORT			: 'turnto.http.import.get',
		UPLOAD			: 'turnto.http.upload.get'
	},

	/*****************************************************
	 * Preferences
	 ****************************************************/

	/**
	 * @name getLocalizedSiteKeyPreference
	 * @desc returns the site key custom site preference using the parameter locale
	 */
	getLocalizedSiteKeyPreference: function (currentLocale) {
		return TurnToHelper.getLocalizedTurnToPreferenceValue(currentLocale).turntoSiteKey;
	},
	
	/**
	 * @name getLocalizedAuthKeyPreference
	 * @desc returns the auth key custom site preference using the parameter locale
	 */
	getLocalizedAuthKeyPreference: function (currentLocale) {
		return TurnToHelper.getLocalizedTurnToPreferenceValue(currentLocale).turntoAuthKey;
	},

	/**
	 * @name getUseVariantsPreference
	 * @desc returns the use variants custom site preference
	 */
	getUseVariantsPreference: function () {
		return dw.system.Site.getCurrent().getCustomPreferenceValue('turntoUseVariants');
	},

	/**
	 * @name getLocalizedDomainURLPreference
	 * @desc returns the localized domain URL
	 */
	getLocalizedDomainURLPreference: function (currentLocale) {
		return TurnToHelper.getLocalizedTurnToPreferenceValue(currentLocale).domain;
	},

	/*****************************************************
	 * Other Getters
	 ****************************************************/

	/**
	 * @name getLogger
	 * @desc returns the logger
	 */
	getLogger: function (method) {
		return Logger.getLogger('int_turnto_core_v5');
	},

	/**
	 * @name getProduct
	 * @desc returns the product ID 
	 */
	getProduct: function(pid) {
		var product = ProductMgr.getProduct(pid);
		var useVariants : Boolean = ServiceFactory.getUseVariantsPreference();
		if (product.isMaster() && useVariants) {
			pid = product.getVariationModel().defaultVariant.ID;
		} else {
			pid = product.isVariant() && !useVariants ? product.masterProduct.ID : product.ID;
		}
		return pid;
	},


	/*****************************************************
	 * Request Data Containers
	 ****************************************************/

	/**
	 * @function
	 * @name buildFeedDownloadRequestContainer
	 * @param {String} xmlName
	 * @param {String} currentLocale
	 * @param {String} file
	 */
	buildFeedDownloadRequestContainer: function (xmlName, currentLocale, file) {

		var siteKey = ServiceFactory.getLocalizedSiteKeyPreference(currentLocale);
		var authKey = ServiceFactory.getLocalizedAuthKeyPreference(currentLocale);
		
		//If turntoAuthKey and turntoSiteKey values are not defined for a particular locale the job should skip the locale.
		if(empty(siteKey) || empty(authKey)) {
			return false;
		}
		
		//Distinguish two different download URLs (Example for UGC http://www.turnto.com/static/export/YOURSITEKEY/YOURAUTHKEY/turnto-ugc.xml)
		//"/turnto-skuaveragerating.xml" OR "/turnto-ugc.xml"
		var url = "http://www." + ServiceFactory.getLocalizedDomainURLPreference(currentLocale) + File.SEPARATOR + "static" + File.SEPARATOR + "export" + File.SEPARATOR + siteKey + File.SEPARATOR + authKey + xmlName;

		var requestDataContainer = {
			requestMethod: 'GET',
			path: url,
			outfile : file
		};

		return requestDataContainer;
	},
	
	/**
	 * @function
	 * @name buildFeedUploadRequestContainer
	 * @param {String} postFileLocation
	 * @param {String} currentLocale
	 * @param {String} file
	 */
	buildFeedUploadRequestContainer: function (postFileLocation, file, siteKey, authKey, domain) {

		//If turntoAuthKey and turntoSiteKey values are not defined for a particular locale the job should skip the locale.
		if(empty(siteKey) || empty(authKey) || empty(domain)) {
			return false;
		}

		//Create array of request parts to add to request
		var arrayOfRequestParts : Array = new Array();
		arrayOfRequestParts.push(new dw.net.HTTPRequestPart('file', file));
		arrayOfRequestParts.push(new dw.net.HTTPRequestPart('siteKey', siteKey));
		arrayOfRequestParts.push(new dw.net.HTTPRequestPart('authKey', authKey));
		arrayOfRequestParts.push(new dw.net.HTTPRequestPart('feedStyle', 'tab-style.1'));

		var url = "http://" + domain + postFileLocation;

		var requestDataContainer = {
			requestMethod: 'POST',
			path: url,
			outfile: file,
			args: arrayOfRequestParts
		};

		return requestDataContainer;
	}

};

module.exports = ServiceFactory;