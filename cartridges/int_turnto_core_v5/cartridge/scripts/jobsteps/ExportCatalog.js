
var catalog = require( 'dw/catalog' );
var URLUtils = require('dw/web/URLUtils');
var Logger = require('dw/system/Logger');
var Site = require('dw/system/Site');
var Status = require('dw/system/Status');

/*Script Modules*/
var TurnToHelper = require('*/cartridge/scripts/util/TurnToHelperUtil');
var CatalogWriterHelper = require('int_turnto_core/cartridge/scripts/util/CatalogWriterHelper');
var ServiceFactory = require('*/cartridge/scripts/util/ServiceFactory');

//Globally scoped variables
var products;
var tempProduct;
var hashMapOfFileWriters;
var allowedLocales;

//function is executed only ONCE
function beforeStep( parameters, stepExecution )
{
	try {
		if (parameters.IsDisabled) {
			return new Status(Status.OK, 'OK', 'Export Catalog job step is disabled.');
		}

		// hashMapOfKeys contains locales for the site setup for TurnTo
		// allowedLocales contains locales for the site defined in SFCC
		hashMapOfKeys = TurnToHelper.getHashMapOfKeys();
		allowedLocales = TurnToHelper.getAllowedLocales();

		//instantiate new hash map to store the locale file writers
		var results = CatalogWriterHelper.initializeFileWritersHashMap(allowedLocales, hashMapOfKeys);
		hashMapOfFileWriters = results.get('hashMapOfFileWriters');
		var areAllowedLocales = results.get('areAllowedLocales');

		// if there are no allowed locales for the site/auth key configuration then do not export a catalog and return an error
		if(!areAllowedLocales) {
			return new Status(Status.ERROR, 'ERROR', 'There are no allowed locales for a catalog export, check the site/auth keys configuration and the site level allowed locales.');
		}

		//query all site products
		products = catalog.ProductMgr.queryAllSiteProductsSorted();
	} catch (e) {
		Logger.error('exportCatalog.js has failed on the beforeStep step with the following error: ' + e.message);
	}
}

//a function that returns the total number of items that are available, this function is called by the framework exactly once before chunk processing begins. A known total count allows better monitoring. 
//For example, to show that 50 of 100 items have already been processed.
function getTotalCount( parameters, stepExecution )
{
	//Return product count
	return !empty(products) ? products.count : 0;
}

//the read function returns either one item or nothing. 
//It returns nothing if there are no more items available
function read( parameters, stepExecution )
{
	// Will strip out variant products from the catalog feed
	// IF "Use Variants" is set to "No"
	try {
		var useVariants = ServiceFactory.getUseVariantsPreference();
		//Return next product
		if( products && products.hasNext() ) {
			tempProduct = products.next();
			//do not return a product if use variants site preference is false and the product is a variant
			if (!useVariants && tempProduct.isVariant()) {
				return '';
			}
			return tempProduct;
		}
	} catch (e) {
		Logger.error('exportCatalog.js has failed on the read step with the following error: ' + e.message);
	}
}

//It receives the item returned by the read function, performs a process, and returns one item
function process( product, parameters, stepExecution )
{
	if(empty(product)) {
		return '';
	}

	//Generate and return a simple mapping object with locale 
	//and formatted output such as ```{ "en_us": "Row data for English US", ...}``` 
	var json = {};
	try {
		//IMAGE
		var imageUrl = CatalogWriterHelper.getProductImageUrl(product);
		
		// PRICE
		var price : Money = product.getPriceModel().getPrice();
		var priceStr : String = price.getValue().toString();
	
		// CATEGORYPATHJSON
		var categoryPathJSON = CatalogWriterHelper.generateProductCategoryJson(product);
		
		// MEMBERS
		var bundledProductsArray : Collection = CatalogWriterHelper.getBundledProducts(product);
		
		// GTIN values
		var gtinHashMap = CatalogWriterHelper.getProductGtinHashMap(product);
		
		//CATEGORY
		//Leaving blank because CATEGORYPATHJSON is populated

		//Iterate all locales, generate and return a simple mapping object with locale 
		//and formatted output such as ```{ "en_us": "Row data for English US", ...}``` 
		hashMapOfKeys = TurnToHelper.getHashMapOfKeys();
		hashMapOfKeys.forEach(function (key) {
			var locales = key.locales;
			
			//KEYWORDS
			var keywords = '';
			if (product.getPageKeywords()) {
				keywords = product.getPageKeywords();
			}
			
			// format locales into an array
			var localesArray = []
			if(locales.indexOf(',') != -1) {
				localesArray = locales.split( "," );
			} else {
				localesArray.push(locales)
			}
			
			// Iterate though the SFCC locales configured for the current site, 
			// and get the relevant locale-based data
			localesArray.forEach(function () {
				//set the request to the current locale so localized attributes will be used
				request.setLocale(l);
				var url = URLUtils.http('Product-Show', 'pid', product.getID()).toString();
				var item = {
						title:			TurnToHelper.replaceNull(product.getName(), ""),
						itemUrl:		url,
						mobileItemUrl:	url
				}
				localeData[l] = item;
			});
					
			var defaultLocale = Site.getCurrent().getDefaultLocale();
			request.setLocale(defaultLocale);
			
			var localeJson = CatalogWriterHelper.generateLocaleJson(product, imageUrl, priceStr, price, categoryPathJSON, bundledProductsArray, gtinHashMap, keywords, localeData);
			json[locales] = localeJson;
		});

	} catch (e) {
		Logger.error('exportCatalog.js has failed on the process step with the following error: ' + e.message);
	}
	return json;
}

//the write function receives a list of items.
//The list size matches the chunk size or smaller, if the number of items in the last available chunk is smaller. 
//The write function returns nothing
function write( json, parameters, stepExecution )
{
	try {
		//Iterate chunks, with each chunk being a mapping object from the process step. 
		//Iterate mapped locales and write formatted data to applicable files.
		hashMapOfKeys.values().forEach(function (keyValue) {
			var currentLocale = keyValue.locales
			//retrieve the current file writer
			var localeFileWriter = hashMapOfFileWriters.get(currentLocale);

			if(!localeFileWriter) {
				continue;
			}
	
			//each JSON Object "jsonObj" is a reference to a product
			json.forEach(function (jsonObj) {
				if(empty(jsonObj)) {
					continue;
				}
				//retrieve the locale specific product data from the JSON
				var localeJSON = jsonObj[currentLocale];
				//each key is a reference to a product attribute
				for (var key in localeJSON) {
					if (localeJSON.hasOwnProperty(key)) {
						localeFileWriter.write( localeJSON[key] );
						localeFileWriter.write("\t");
					}
				}
				localeFileWriter.write("\n");
			});
		});
	} catch (e) {
		Logger.error('exportCatalog.js has failed on the write step with the following error: ' + e.message);
	}
} 

//function is executed only ONCE
function afterStep( success, parameters, stepExecution )
{
	try {
		//loop through all the locales and close each corresponding file writer
		hashMapOfKeys.values().forEach(function () {
			var locales = key.locales;
			//retrieve the current file writer
			var currLocaleFileWriter = hashMapOfFileWriters.get(locales);
	
			if(!empty(currLocaleFileWriter)) {
				currLocaleFileWriter.close();
			}
		});
	} catch (e) {
		Logger.error('exportCatalog.js has failed on the afterStep step with the following error: ' + e.message);
	}
}

module.exports = {
		beforeStep: beforeStep,
		getTotalCount: getTotalCount,
		read: read,
		process: process,
		write: write,
		afterStep: afterStep
	};
