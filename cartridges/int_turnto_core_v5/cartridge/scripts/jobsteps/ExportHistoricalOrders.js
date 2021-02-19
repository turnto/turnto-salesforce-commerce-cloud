/**
 * exportHistoricalOrders.js
 * 
 * The script exports order data to the Import/Export folder (impex) 
 * 
 * Job Parameters:
 *   ExportFileName : String File name of the file to be exported to TurnTo
 *   IsDisabled : Boolean Mark the step as disabled. This will skip the step and returns a OK status
 */

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
		var results = OrderWriterHelper.processArgsNightlyFeed(arguments);
		if (results['status']) {
			return results['status']
		}
		var exportFileName = results['exportFileName'];
		var historicalOrderDays = results['historicalOrderDays'];

		//loop through all allowed locales per site
		TurnToHelper.getAllowedLocales().forEach(function (currentLocale) {
			try {
				var orders = OrderWriterHelper.getOrders(historicalOrderDays, currentLocale);
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
		return new Status(Status.ERROR, 'ERROR', 'FAILED An exception occurred while attempting to export the orders. Error message: ' + exception.message);
	} finally {
		//check all readers are closed in case catch block is hit
		if (!empty(fileWriter)) {
			fileWriter.close();
		}
	}
	return new Status(Status.OK, 'OK', 'Export Orders was successful.');
}

exports.Run = run;
