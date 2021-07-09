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

                // write header text
                currentFileWriter.writeLine('SKU\tIMAGEURL\tTITLE\tPRICE\tCURRENCY\tACTIVE\tITEMURL\tCATEGORY\tKEYWORDS\tINSTOCK\tVIRTUALPARENTCODE\tCATEGORYPATHJSON\tMEMBERS\tBRAND\tMPN\tISBN\tUPC\tEAN\tJAN\tASIN\tMOBILEITEMURL\tLOCALEDATA');
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
        // Non-localized data
        // IMAGEURL
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
        // PRICE
        var price = product.getPriceModel().getPrice();
        var priceStr = price.getValue().toString();

        // CATEGORYPATHJSON
        var categoryPathJSON = null;
        if (product.getPrimaryCategory() != null) {
            categoryPathJSON = [];
            var currentCategory = product.getPrimaryCategory();
            var categoryArray = [];
            while (currentCategory != null && !currentCategory.isRoot()) {
                var categoryjson = {
                    id: currentCategory.getID(),
                    name: TurnToHelper.replaceNull(currentCategory.getDisplayName()),
                    url: URLUtils.http('Search-Show', 'cgid', currentCategory.getID()).toString()
                };
                categoryArray.push(JSON.stringify(categoryjson));
                currentCategory = currentCategory.getParent();
            }
            categoryArray.reverse();
            categoryPathJSON = '[' + TurnToHelper.replaceNull(categoryArray.toString(), '') + ']';
        }

        // MEMBERS
        var bundledProducts = product.getBundledProducts();
        var bundledProductsArray = [];

        for (var j = 0; j < bundledProducts.size(); j++) {
            var subProduct = bundledProducts[j];
            bundledProductsArray.push(subProduct.getID());
        }

        var mpn = '';
        var isbn = '';
        var upc = '';
        var ean = '';
        var jan = '';
        var asin = '';
        if (product.isMaster()) {
            // Comma-separated variants for GTINs
            for (var i = 0; i < product.variants.length; i++) {
                var variant = product.variants[i];
                // MPN
                if (variant.getManufacturerSKU()) {
                    mpn += variant.getManufacturerSKU();
                    if (i !== product.variants.length - 1) {
                        mpn += ',';
                    }
                }
                // UPC
                if (variant.getUPC()) {
                    upc += variant.getUPC();
                    if (i !== product.variants.length - 1) {
                        upc += ',';
                    }
                }
                // EAN
                if (variant.getEAN()) {
                    ean += variant.getEAN();
                    if (i !== product.variants.length - 1) {
                        ean += ',';
                    }
                }
            }
        } else {
            // MPN
            if (product.getManufacturerSKU()) {
                mpn = product.getManufacturerSKU();
            }

            // ISBN
            isbn = '';

            // UPC
            if (product.getUPC()) {
                upc = product.getUPC();
            }

            // EAN
            if (product.getEAN()) {
                ean = product.getEAN();
            }

            // JAN
            jan = '';

            // ASIN
            asin = '';
        }

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

            var urlOverride = key.url;

            localesArray.forEach(function (l) {
                request.setLocale(l);
                var url = urlOverride + URLUtils.url('Product-Show', 'pid', product.getID()).toString();
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
                sku: TurnToHelper.replaceNull(product.getID(), ''),
                imageurl: imageURL,
                title: TurnToHelper.sanitizeStr(product.getName(), ' '),
                price: TurnToHelper.replaceNull(priceStr, ''),
                currency: TurnToHelper.replaceNull(price.getCurrencyCode(), ''),
                active: product.getAvailabilityModel().isOrderable() ? 'Y' : 'N',
                itemurl: urlOverride + URLUtils.url('Product-Show', 'pid', product.getID()).toString();,
                category: '', // Leaving blank because CATEGORYPATHJSON is populated
                keywords: TurnToHelper.sanitizeStr(keywords, ' '),
                instock: product.getOnlineFlag() ? 'Y' : 'N',
                virtualparentcode: product.isVariant() ? product.masterProduct.ID : product.ID,
                categorypathjson: categoryPathJSON || '',
                members: TurnToHelper.replaceNull(bundledProductsArray, ''),
                brand: product.getBrand() ? product.getBrand() : '',
                mpn: TurnToHelper.sanitizeStr(mpn, ' '),
                isbn: TurnToHelper.sanitizeStr(isbn, ' '),
                upc: TurnToHelper.sanitizeStr(upc, ' '),
                ean: TurnToHelper.sanitizeStr(ean, ' '),
                jan: TurnToHelper.sanitizeStr(jan, ' '),
                asin: TurnToHelper.sanitizeStr(asin, ' '),
                mobileitemurl: '',
                localedata: JSON.stringify(localeData)
            };

            json[locales] = localejson;
        });
    } catch (e) {
        Logger.error('exportCatalog.js has failed on the process step with the following error: {0}', e.message);
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
        Logger.error('exportCatalog.js has failed on the write step with the following error: {0}', e.message);
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
        Logger.error('exportCatalog.js has failed on the afterStep step with the following error: {0}', e.message);
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
