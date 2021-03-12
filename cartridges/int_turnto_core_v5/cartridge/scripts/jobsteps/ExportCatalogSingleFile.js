'use strict';

var catalog = require('dw/catalog');
var FileWriter = require('dw/io/FileWriter');
var File = require('dw/io/File');
var URLUtils = require('dw/web/URLUtils');
var HashMap = require('dw/util/HashMap');
var Logger = require('dw/system/Logger');
var Site = require('dw/system/Site');
var Status = require('dw/system/Status');

/* Script Modules */
var TurnToHelper = require('*/cartridge/scripts/util/turnToHelperUtil');
var ServiceFactory = require('*/cartridge/scripts/util/serviceFactory');

// Globally scoped variables
var products;
var tempProduct;
var hashMapOfFileWriters;
var hashMapOfKeys = new HashMap();
var allowedLocales;

/**
 * Function is executed only ONCE
 * @param {Object} parameters - job parametrs
 * @returns {dw.system.Status} - completion status
 */
function beforeStep(parameters) {
    if (parameters.IsDisabled) {
        return new Status(Status.OK, 'OK', 'Export Catalog job step is disabled.');
    }

    try {
        hashMapOfKeys = TurnToHelper.getHashMapOfKeys();
        allowedLocales = TurnToHelper.getAllowedLocales();

		// instantiate new hash map to store the locale file writers
        hashMapOfFileWriters = new HashMap();

        var impexPath = File.getRootDirectory(File.IMPEX).getFullPath();

		// if there are no allowed locales for the site/auth key configuration then do not export a catalog and return an error
        var areAllowedLocales = false;

        hashMapOfKeys.values().toArray().forEach(function (key) {
			// create an array of locales since some keys have multiple locales (replace whitespace with no whitespace to prevent invalid folders in the IMPEX)
            var locales = key.locales.replace(' ', '').split(',');
            var isAllowedLocale = true;
            var locale = null;

            for (var i = 0; i < locales.length; i++) {
				// check if locale is allowed on the site, if it is not allowed, mark the variable as false and break out of the loop to continue to the next key
                locale = locales[i];
                if (allowedLocales.indexOf(locales[i]) <= -1) {
                    isAllowedLocale = false;
                    break;
                }
            }

			// if there are no allowed locales for the site/auth key configuration then do not export a catalog and return an error
            if (isAllowedLocale) {
                areAllowedLocales = true;

				// create a folder with one or more locales
                var folderAndFilePatternName = locales.join().replace(',', '_');
                var turntoDir = new File(impexPath + File.SEPARATOR + 'TurnTo' + File.SEPARATOR + locale);

                if (!turntoDir.exists()) {
                    turntoDir.mkdirs();
                }

				// Initialize a file writer for output with the current key
                var catalogExportFileWrite = new File(turntoDir.getFullPath() + File.SEPARATOR + parameters.ExportFileName + '_' + folderAndFilePatternName + '_' + Site.getCurrent().ID + '.txt');
                catalogExportFileWrite.createNewFile();

                var currentFileWriter = new FileWriter(catalogExportFileWrite);

                hashMapOfFileWriters.put(key.locales, currentFileWriter);
            }
        });

		// if there are no allowed locales for the site/auth key configuration then do not export a catalog and return an error
        if (!areAllowedLocales) {
            return new Status(Status.ERROR, 'ERROR', 'There are no allowed locales for a catalog export, check the site/auth keys configuration and the site level allowed locales.');
        }

		// query all site products
        products = catalog.ProductMgr.queryAllSiteProductsSorted();
    } catch (e) {
        Logger.error('exportCatalog.js has failed on the beforeStep step with the following error: ' + e.message);
        return new Status(Status.ERROR, 'ERROR', 'There are no allowed locales for a catalog export, check the site/auth keys configuration and the site level allowed locales.');
    }
    return null;
}

/**
 * A function that returns the total number of items that are available,
 * this function is called by the framework exactly once before chunk processing begins.
 * A known total count allows better monitoring.
 * For example, to show that 50 of 100 items have already been processed.
 * @returns {number} - completion status
 */
function getTotalCount() {
	// Return product count
    return !empty(products) ? products.count : 0;
}

/**
 * The read function returns either one item or nothing.
 * It returns nothing if there are no more items available
 * @returns {number} - completion status
 */
function read() {
    try {
        var useVariants = ServiceFactory.getUseVariantsPreference();
		// Return next product
        if (products && products.hasNext()) {
            tempProduct = products.next();
			// do not return a product if use variants site preference is false and the product is a variant
            if (!useVariants && tempProduct.isVariant()) {
                return '';
            }
            return tempProduct;
        }
    } catch (e) {
        Logger.error('exportCatalog.js has failed on the read step with the following error: ' + e.message);
    }
    return null;
}

/**
 * It receives the item returned by the read function, performs a process, and returns one item
 * @param {*} product -
 * @returns {number} - completion status
 */
function process(product) {
    if (empty(product)) {
        return '';
    }

	// Generate and return a simple mapping object with locale
	// and formatted output such as ```{ "en_us": "Row data for English US", ...}```
    var json = {};

    try {
		// Iterate all locales, generate and return a simple mapping object with locale
		// and formatted output such as ```{ "en_us": "Row data for English US", ...}```
        var keyValues = hashMapOfKeys.values().toArray();
        keyValues.forEach(function (key) {
            var locales = key.locales;
			// CATEGORY
            // Leaving blank because CATEGORYPATHJSON is populated

			// KEYWORDS
            var keywords = '';
            if (product.getPageKeywords()) {
                keywords = product.getPageKeywords();
            }

			// add locales specific data
            var localeData = {};
            var localesArray = [];
            if (locales.indexOf(',') !== -1) {
                localesArray = locales.split(',');
            } else {
                localesArray.push(locales);
            }

            localesArray.forEach(function (l) {
                request.setLocale(l);
                var url = URLUtils.http('Product-Show', 'pid', product.getID()).toString();
                var item = {
                    title: TurnToHelper.sanitizeStr(product.getName(), ' '),
                    itemUrl: url,
                    mobileItemUrl: url
                };
                localeData[l] = item;
            });

            var defaultLocale = Site.getCurrent().getDefaultLocale();
            request.setLocale(defaultLocale);
			// build locale JSON
            var localejson = {
                localedata: JSON.stringify(localeData)
            };

            json[locales] = localejson;
        });
    } catch (e) {
        Logger.error('exportCatalog.js has failed on the process step with the following error: ' + e.message);
    }
    return json;
}

/**
 * the write function receives a list of items.
 * The list size matches the chunk size or smaller, if the number of items in the last available chunk is smaller.
 * The write function returns nothing
 * @param {Object} json - save json object
 */
function write(json) {
    try {
		// Iterate chunks, with each chunk being a mapping object from the process step.
		// Iterate mapped locales and write formatted data to applicable files.
        var keyValues = hashMapOfKeys.values().toArray();
        keyValues.forEach(function (keyVal) {
            var currentLocale = keyVal.locales;
			// retrieve the current file writer
            var localeFileWriter = hashMapOfFileWriters.get(currentLocale);

            if (localeFileWriter) {
			// each JSON Object "jsonObj" is a reference to a product
                Object.keys(json).forEach(function (property) {
                    var jsonObj = json[property];
                    if (!empty(jsonObj)) {
						// retrieve the locale specific product data from the JSON
                        var localeJSON = jsonObj[currentLocale];
						// each key is a reference to a product attribute
                        Object.keys(localeJSON).forEach(function (key) {
                            if (Object.hasOwnProperty.call(localeJSON, key)) {
                                localeFileWriter.write(localeJSON[key]);
                                localeFileWriter.write('\t');
                            }
                        });
                        localeFileWriter.write('\n');
                    }
                });
            }
        });
    } catch (e) {
        Logger.error('exportCatalog.js has failed on the write step with the following error: ' + e.message);
    }
}

/**
 * Function is executed only ONCE
 */
function afterStep() {
    try {
        // close product seekable iterators
        products.close();
        // loop through all the locales and close each corresponding file writer
        var keyValues = hashMapOfKeys.values().toArray();
        keyValues.forEach(function (keyVal) {
            var currentLocale = keyVal.locales;
			// retrieve the current file writer
            var localeFileWriter = hashMapOfFileWriters.get(currentLocale);

            if (localeFileWriter) {
                localeFileWriter.close();
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
