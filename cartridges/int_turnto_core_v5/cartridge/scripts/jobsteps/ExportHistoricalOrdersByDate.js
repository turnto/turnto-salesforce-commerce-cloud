/**
 * exportHistoricalOrdersByDate.js
 *
 * The script exports order data from a specific date to the Import/Export folder (impex) 
 * 
 * Job Parameters:
 *   ExportFileName : String File name of the file to be exported to TurnTo
 *   IsDisabled : Boolean Mark the step as disabled. This will skip the step and returns a OK status
 */

var Site = require('dw/system/Site');
var File = require('dw/io/File');
var FileWriter = require('dw/io/FileWriter');
var OrderMgr = require('dw/order/OrderMgr');
var Calendar = require('dw/util/Calendar');
var Status = require('dw/system/Status');

/*Script Modules*/
var TurnToHelper = require('*/cartridge/scripts/util/TurnToHelperUtil');
var OrderWriterHelper = require('*/cartridge/scripts/util/OrderWriterHelper');

/**
 * @function
 * @name run
 * @description The main function.
 * @returns {dw.system.Status} The exit status for the job step
 */
var run = function run() {

	try {
		var results = OrderWriterHelper.processArgsHistoricalFeed(arguments);
			if (results['status']) {
			return results['status']
		}
		var exportFileName = results['exportFileName'];
		var historicalOrderDate = results['historicalOrderDate'];
		
		//loop through all allowed locales per site
		TurnToHelper.getAllowedLocales().forEach(function () {
			try {
				var orders = OrderWriterHelper.getOrdersFromDate(historicalOrderDate, currentLocale);
				if (orders.count == 0) {
					// Do not create the file writer and continue to next locale
					continue;
				}

				var fileWriter = initializeFileWriter(currentLocale, exportFileName);

				//set the request to the current locale so localized attributes will be used
				request.setLocale(currentLocale);
				OrderWriterHelper.writeAllOrdersData(orders, fileWriter, currentLocale);
			} catch (e) {
				var error = e;
				throw new Error('FAILED: Error message: ' + e.message);
			} finally {
				if (fileWriter != null) {
					fileWriter.close();
				}
			}
		});
	} catch(exception) {
		return new Status(Status.ERROR, 'ERROR', 'FAILED An exception occurred while attempting to export the orders by date. Error message: ' + exception.message);
	} finally {
		//check all readers are closed in case the catch block is hit
		if (!empty(fileWriter)) {
			fileWriter.close();
		}
	}
	return new Status(Status.OK, 'OK', 'Export Orders by Date was successful.');
}

exports.Run = run;
