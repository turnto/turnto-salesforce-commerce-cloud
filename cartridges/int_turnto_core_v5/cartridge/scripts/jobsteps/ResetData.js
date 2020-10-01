var system = require( 'dw/system' );
var catalog = require( 'dw/catalog' );
var Status = require('dw/system/Status');
var txn = require('dw/system/Transaction');

/*Script Modules*/
var TurnToHelper = require('*/cartridge/scripts/util/TurnToHelperUtil');

//Globally scoped variables
var products;
var product;
var allowedLocales = TurnToHelper.getAllowedLocales();
 
//function is executed only ONCE
function beforeStep( parameters, stepExecution ) {

	if (parameters.IsDisabled) {
		return new Status(Status.OK, 'OK', 'Reset Data job step is disabled.');
	}

	products = catalog.ProductMgr.queryAllSiteProducts();

	dw.system.Logger.info('Products count: ' + products.length);	
	
	// Check mandatory parameters
	if (empty(parameters.DataType) || (parameters.DataType != 'ratings' && parameters.DataType != 'ugc')) {
		return new Status(Status.ERROR, 'ERROR', 'Data Type is missing or value is invalid. Current data type: ' + parameters.DataType);
	}
}

//a function that returns the total number of items that are available, this function is called by the framework exactly once before chunk processing begins. A known total count allows better monitoring. 
//For example, to show that 50 of 100 items have already been processed.
function getTotalCount( parameters, stepExecution ) { 

	return !empty(products) ? products.count : 0;
}

//the read function returns either one product or nothing
//It returns nothing if there are no more items available in the chunk
function read( parameters, stepExecution ) {

	if( products && products.hasNext() ) {
		return products.next();
	}
	return;
}

//The function receives the item returned by the read function which is the next sequential product in the current chunk, then resets either the reviews or UGC data depending on the "dataType" and then returns to the read function for the next product in the chunk if there is one
function process( product, parameters, stepExecution ) {

	if(empty(product)) {
		return '';
	}

	//Iterate all locales and reset TurnTo product attributes to an empty string;
	for each(currentLocale in allowedLocales) {

		//set the request to the current locale so localized attributes will be used
		request.setLocale(currentLocale);
		try {
			txn.begin();
	
			//dataType is either "ratings" or "ugc"
			if(parameters.DataType == 'ratings') {
				product.custom.turntoAverageRating = '';
				product.custom.turntoReviewCount = 0;
				product.custom.turntoRelatedReviewCount = 0;
				product.custom.turntoCommentCount = 0;
			} else {
				product.custom.turntoUserGeneratedContent = '';
			}
	
			txn.commit();
		} catch(e) {
			Logger.error('Product SKU {0} failed to reset due to {1}', product.ID, e.message);
		}
	}
	return;
}

//empty write function, required to have the write function per Job Framework documentation even if it's empty
function write( json, parameters, stepExecution ) {
	return;
}

module.exports = {
	beforeStep: beforeStep,
	getTotalCount: getTotalCount,
	read: read,
	process: process,
	write: write
};
