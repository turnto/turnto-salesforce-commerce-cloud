/*
 * Order Helper to write order and product data
 * 
 */
 
var Site = require('dw/system/Site');
var FileWriter = require('dw/io/FileWriter');
var URLUtils = require('dw/web/URLUtils');
var File = require('dw/io/File');
var HashMap = require('dw/util/HashMap');

/*Script Modules*/
var TurnToHelper = require('*/cartridge/scripts/util/HelperUtil');

const CATALOG_FEED_HEADER = "SKU\tIMAGEURL\tTITLE\tPRICE\tCURRENCY\tACTIVE\tITEMURL\tCATEGORY\tKEYWORDS\tINSTOCK\tVIRTUALPARENTCODE\tCATEGORYPATHJSON\tMEMBERS\tBRAND\tMPN\tISBN\tUPC\tEAN\tJAN\tASIN\tMOBILEITEMURL\tLOCALEDATA";

var CatalogWriterHelper = {
	
	/**
	 * @function
	 * @name getCatalogFeedHeader
	 * @return {String} The Catalog Feed Header const
	 */
	getCatalogFeedHeader: function () {
		return CATALOG_FEED_HEADER;
	},
	
	/**
	 * @function
	 * @name initializeFileWritersHashMap
	 * @param allowedLocales An array of locale IDs that the current site has assigned
	 * @return {HashMap} A Hash Map containing:
	 *						- "areAllowedLocales" - whether there's any allowed locales
	 *                      - "hashMapOfFileWriters" - a hash map with a file writer for each valid locale
	 *
	 * This function is used to set up file writers for each locale. As each locale
     * is processed, it will write the catalog feed file to the associated file writer
	 */
	initializeFileWritersHashMap: function (allowedLocales, hashMapOfKeys) {
		hashMapOfFileWriters = new HashMap();
		var impexPath = File.getRootDirectory(File.IMPEX).getFullPath();

		// if there are no allowed locales for the site/auth key configuration then do not export a catalog and return an error
		var areAllowedLocales = false;

		hashMapOfKeys.forEach(function (key) {
			// create an array of locales since some keys have multiple locales (replace whitespace with no whitespace to prevent invalid folders in the IMPEX)
			var locales = key.locales.replace(' ', '').split(',');
			var isAllowedLocale =  true;

			locales.forEach(function (locale) {
				// check if locale is allowed on the site, if it is not allowed, mark the variable as false and break out of the loop to continue to the next key
				if(allowedLocales.indexOf(locale) <= -1) {
					isAllowedLocale = false;
					break;
				}
			});

			// if the one or more locales are not allowed then continue to the next key and do not create a file writer
			if(!isAllowedLocale) {
				continue;
			}

			// if there are no allowed locales for the site/auth key configuration then do not export a catalog and return an error
			areAllowedLocales = true;

			// create a folder with one or more locales
			var folderAndFilePatternName = locales.join().replace(',', '_');
			var turntoDir = new File(impexPath + File.SEPARATOR + "TurnTo" + File.SEPARATOR + locale);

			if (!turntoDir.exists()) {
				turntoDir.mkdirs();
			}

			// Initialize a file writer for output with the current key
			var catalogExportFileWrite = new File(turntoDir.getFullPath() + File.SEPARATOR + parameters.ExportFileName + '_' + folderAndFilePatternName + '_' + Site.getCurrent().ID + '.txt');
			catalogExportFileWrite.createNewFile();

			var currentFileWriter = new FileWriter(catalogExportFileWrite);

			// write header text
			currentFileWriter.writeLine(CatalogWriterHelper.getCatalogFeedHeader());
			
			//add the file writer to the hashmap with the key value being the current locale
			hashMapOfFileWriters.put(key.locales, currentFileWriter);
		});
		
		var results = new HashMap();
		results.put('areAllowedLocales', areAllowedLocales);
		results.put('hashMapOfFileWriters', hashMapOfFileWriters);
		
		return results;
	},
	
	/**
	 * @function
	 * @name getProductImageUrl
	 * @param product the product we're fetching the image URL for
	 * @return {String} The URL of the first image found associated with the product
	 *
	 * This function is used to retrive a product's image URL
	 */
	getProductImageUrl: function (product) {
		var image : MediaFile = product.getImage("hi-res", 0);
		var imageURL = '';
		if (image == null) {
			image = product.getImage("large", 0);
		}
		if (image == null) {
			image = product.getImage("medium", 0);
		}
		if (image == null) {
			image = product.getImage("small", 0);
		}
		if (image == null) {
			image = product.getImage("swatch", 0);
		}
		if (image != null) {
			imageURL = image.getAbsURL().toString();
		}
		
		return imageURL;
	},
	
	/**
	 * @function
	 * @name generateProductCategoryJson
	 * @param product the product we're fetching the category info for
	 * @return {String} Stringified array of categories
	 *
	 * This function is used to retrive a product's category data in stringified JSON form
	 */
	generateProductCategoryJson: function (product) {
		var categoryPathJSON = '';
		// Starting with a product's primary category, add it to the category array, 
		// then move on to the category's parent. At the end, reverse so the order 
		// is from the top category down
		if (product.getPrimaryCategory() != null) {
			var currentCategory = product.getPrimaryCategory();
			var categoryArray = new Array();
			while (currentCategory != null && !currentCategory.isRoot()) 
			{
				var categoryjson = [{
						id : currentCategory.getID(),
						name : TurnToHelper.replaceNull(currentCategory.getDisplayName()),
						url : URLUtils.http('Search-Show', 'cgid', currentCategory.getID()).toString()
				}]
				categoryArray.push(JSON.stringify(categoryjson));
				currentCategory = currentCategory.getParent();
			}
			categoryArray.reverse();
			categoryPathJSON = categoryArray.toString();
		}
		return categoryPathJSON;
	},
	
	/**
	 * @function
	 * @name getBundledProducts
	 * @param product the product we're fetching the bundle info for
	 * @return {Array} Array of product IDs in the bundle or an empty array if the current product isn't a bundle
	 *
	 * This function is used to retrive an array of product IDs if the current product is a bundle
	 */
	getBundledProducts: function (product) {
		// Get all products that are contained in the bundle (will be empty if not a bundle)
		// and add each one's product ID to the array
		var bundledProducts : Collection = product.getBundledProducts();
		var bundledProductsArray = new Array();
		for (var i : Number = 0; i < bundledProducts.size(); i++) {
			var subProduct : Product = bundledProducts[i];
			bundledProductsArray.push(subProduct.getID());
		}
		
		return bundledProductsArray;
	},
	
	/**
	 * @function
	 * @name getProductGtinHashMap
	 * @param product the product we're fetching the GTIN info for
	 * @return {HashMap} A Hash Map whose keys are 'ean','upc', etc., and whose values are the values for that GTIN
	 *
	 * If the product is a master product, the values will be a comma delimted list of the products' variant's values. 
	 * If the product is a variant, the values will just be the values for that product
	 * ISBN, JAN, and ASIN are never populated
	 */
	getProductGtinHashMap: function (product) {
		var gtinHashMap = new HashMap();
		// These are always empty
		gtinHashMap.put("isbn", "");
		gtinHashMap.put("jan", "");
		gtinHashMap.put("asin", "");
		
		// If the product is a master product, GTIN values should be 
		// a comma separated list of the variants' GTIN values
		if (product.isMaster()) {
			//Comma-separated variants for GTINs
			var mpn = "";
			var upc = "";
			var ean = "";
			for (var i=0; i<product.variants.length;i++) {
				var variant = product.variants[i];
				// MPN
				if (variant.getManufacturerSKU()) {
					mpn+=variant.getManufacturerSKU();
					if(i != product.variants.length-1) {
						mpn+=",";
					}
				}
				// UPC
				if (variant.getUPC()) {
					upc+=variant.getUPC();
					if(i != product.variants.length-1) {
						upc+=",";
					}
				}
				// EAN
				if (variant.getEAN()) {
					ean+=variant.getEAN();
					if(i != product.variants.length-1) {
						ean+=",";
					}
				}
			}
		} else {
			// If a product is a variant, just use the product's GTIN value as normal
			// MPN
			if (product.getManufacturerSKU()) {
				mpn = product.getManufacturerSKU();
			}
			// UPC
			if (product.getUPC()) {
				upc = product.getUPC();
			}
			// EAN
			if (product.getEAN()) {
				ean = product.getEAN();
			}
		}
		
		gtinHashMap.put("mpn", mpn);
		gtinHashMap.put("upc", upc);
		gtinHashMap.put("ean", ean);
		
		return gtinHashMap;
	},
	
	generateLocaleJson: function (product, imageUrl, priceStr, price, categoryPathJSON, bundledProductsArray, gtinHashMap, keywords, localeData) {
		//build locale JSON
		var localeJson = {
			sku : 				TurnToHelper.replaceNull(product.getID(), ""),
			imageurl:			imageUrl,
			title:				TurnToHelper.replaceNull(product.getName(), ""),
			price : 			TurnToHelper.replaceNull(priceStr, ""),
			currency : 			TurnToHelper.replaceNull(price.getCurrencyCode(), ""),
			active : 			product.getAvailabilityModel().isOrderable() ? "Y" : "N",
			itemurl:				URLUtils.http('Product-Show', 'pid', product.getID()).toString(),
			category : 			'', //Leaving blank because CATEGORYPATHJSON is populated
			keywords : 			TurnToHelper.replaceNull(keywords, ""),
			instock : 			product.getOnlineFlag() ? "Y" : "N",
			virtualparentcode : product.isVariant() ? product.masterProduct.ID : "",
			categorypathjson :	categoryPathJSON ? categoryPathJSON : '',
			members :			TurnToHelper.replaceNull(bundledProductsArray, ""),
			brand :				product.getBrand() ? product.getBrand() : '',
			mpn :				gtinHashMap.get('mpn'),
			isbn :				gtinHashMap.get('isbn'),
			upc :				gtinHashMap.get('upc'),
			ean :				gtinHashMap.get('ean'),
			jan :				gtinHashMap.get('jan'),
			asin :				gtinHashMap.get('asin'),
			mobileitemurl:		"",
			localedata: 		JSON.stringify(localeData)
		};
	
		return localeJson;
	}
}

module.exports = CatalogWriterHelper;
