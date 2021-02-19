/*
 * Order Helper to write order and product data
 * 
 */
 
var Site = require('dw/system/Site');
var FileWriter = require('dw/io/FileWriter');
var URLUtils = require('dw/web/URLUtils');
var Order = require('dw/order/Order');
var Product = require('dw/catalog/Product');
var Calendar = require('dw/util/Calendar');

/*Script Modules*/
var TurnToHelper = require('*/cartridge/scripts/util/TurnToHelperUtil');

var OrderWriterHelper = {
		
	/**
	 * @function
	 * @name processArgs
	 * @param incomingArgs The arguments array passed in to the job
	 * @return {HashMap} A Hash Map containing:
	 *						- "status": a job status if something stopped the job, or null if it executed without issue
	 *						- "exportFileName": the value of the exportFileName job parameter
	 *						- "historicalOrderDays": the value of the historicalOrderDays site configuration
	 */
	processArgsNightlyFeed: function(incomingArgs) {
		var args = incomingArgs[0];
		var status = null;
		
		// Check if the step is disabled
		if (args.IsDisabled) {
			status = new Status(Status.OK, 'OK', 'Step disabled, skip it...');
		}
		// Load input Parameters
		var exportFileName = args.ExportFileName;
		// Check if the file name parameter is present
		if (empty(exportFileName)) {
			status = new Status(Status.ERROR, 'ERROR', 'One or more mandatory parameters are missing. Export File Name = (' + exportFileName + ')');
		}
	
		// How many days back we should fetch orders
		var historicalOrderDays : Integer = Site.getCurrent().getCustomPreferenceValue('turntoHistoricalOrderDays');
		if (empty(historicalOrderDays)) {
			status = new Status(Status.ERROR, 'ERROR', 'Mandatory site preference "turntoHistoricalOrderDays" is missing. Export File Name = (' + exportFileName + ')');
		}
		
		var results = new HashMap();
		results.put("status", status);
		results.put("exportFileName", exportFileName);
		results.put("historicalOrderDays", historicalOrderDays);
		
		return results;
	},
	
	processArgsHistoricalFeed: function(incomingArgs) {
		var args = incomingArgs[0];
		var status = null;
		
		// Check if the step is disabled
		if (args.IsDisabled) {
			status = new Status(Status.OK, 'OK', 'Step disabled, skip it...');
		}
		// Load input Parameters
		var exportFileName = args.ExportFileName;
		// Check if the file name parameter is present
		if (empty(exportFileName)) {
			status = new Status(Status.ERROR, 'ERROR', 'One or more mandatory parameters are missing. Export File Name = (' + exportFileName + ')');
		}
	
		// How many days back we should fetch orders
		var historicalOrderDate : Integer = Site.getCurrent().getCustomPreferenceValue('turntoHistoricalOrderDate');
		if (empty(historicalOrderDate)) {
			status = new Status(Status.ERROR, 'ERROR', 'Mandatory site preference "turntoHistoricalOrderDate" is missing. Export File Name = (' + exportFileName + ')');
		}
		
		var results = new HashMap();
		results.put("status", status);
		results.put("exportFileName", exportFileName);
		results.put("historicalOrderDate", historicalOrderDate);
		
		return results;
	},

	/**
	 * @function
	 * @name getOrders
	 * @param historicalOrderDays the number of days previous from which to grab orders
	 * @param currentLocale the locale that's currently being processed
	 * @return {SeekableIterator} returns a list of orders created in the last X days
	 */
	getOrders: function (historicalOrderDays, currentLocale) {
		var dateLimit = new Calendar();
		dateLimit.add(Calendar.DAY_OF_YEAR, historicalOrderDays*-1);
			
		var query : String = "creationDate >= {0} AND customerLocaleID = {1}";
		var orders : SeekableIterator =  OrderMgr.searchOrders(query, "creationDate asc", dateLimit.getTime(), currentLocale);
		
		return orders;
	},
	
	getOrdersFromDate: function (historicalOrderDate, currentLocale) {
		var query = 'creationDate >= {0} AND customerLocaleID = {1}';
		var orders = OrderMgr.searchOrders(query, 'creationDate asc', historicalOrderDate, currentLocale);
		
		return orders;
	},
	
	/**
	 * @function
	 * @name initializeFileWriter
	 * @param currentLocale the locale that's currently being processed
	 * @param exportFileName the file name to use
	 * @return {SeekableIterator} returns a list of orders created in the last X days
	 */
	initializeFileWriter: function (currentLocale, exportFileName) {
		// Get the file path where the output will be stored
		var impexPath : String = File.getRootDirectory(File.IMPEX).getFullPath();
		
		// Create a TurnTo directory if one doesn't already exist
		var turntoDir : File = new File(impexPath + File.SEPARATOR + "TurnTo" + File.SEPARATOR + currentLocale);
		if (!turntoDir.exists()) {
			turntoDir.mkdirs();
		}
		
		// Initialize a file writer for output
		var orderExportFile : File = new File(turntoDir.getFullPath() + File.SEPARATOR + exportFileName + '_' + currentLocale + '_' + Site.getCurrent().ID +'.txt');
		var fileWriter : FileWriter = new FileWriter(orderExportFile);
		
		// Write the header
		fileWriter.writeLine("ORDERID\tORDERDATE\tEMAIL\tITEMTITLE\tITEMURL\tITEMLINEID\tZIP\tFIRSTNAME\tLASTNAME\tSKU\tPRICE\tITEMIMAGEURL\tTEASERSHOWN\tTEASERCLICKED\tDELIVERYDATE\tNICKNAME\tLOCALE");
		
		return fileWriter;
	},
	
	writeAllOrdersData: function (orders, fileWriter, currentLocale) {
		try {
			while (orders.hasNext()) {
				var order : Order = orders.next();
				//using the order writer helper, write the product data
				this.writeOrderData(order, fileWriter, currentLocale);
			}
		} finally {
			if (orders != null) {
				orders.close();
			}
		}
	},
		
	/**
	 * @function
	 * @name getLocalizedTurnToPreferenceValue
	 * @param preferenceName The name of the localized TurnTo SitePreference to retrieve
	 * @param locale The locale in which to retrieve a value. If not matching locale is returned, the default is used
	 * @return {String} The localized value of the Site Preference specified by the preferenceName parameter
	 */
	writeOrderData: function( order, fileWriter, currentLocale) {

		// Get all of the product line items for the order
		var products : Collection = order.getAllProductLineItems();
		
		var useVariants : Boolean = Site.getCurrent().getCustomPreferenceValue('turntoUseVariants') == true;
		
		for (var i : Number = 0; i < products.size(); i++) {
			var productLineItem : ProductLineItem = products[i];
			var product : Product = productLineItem.getProduct();
			if (product == null){
				continue;
			}
		
			if (product.isVariant() && !useVariants) {
				product = product.getVariationModel().getMaster();
			}
		
			// ORDERID
			fileWriter.write(order.getOrderNo());
			fileWriter.write("\t");
		
			// ORDERDATE
			// Format: 2011-08-25 20:50:15
			var creationDate : Date = order.getCreationDate();
			var creationStr = dw.util.StringUtils.formatCalendar(new Calendar(creationDate), "yyyy-MM-dd hh:mm:ss");
			fileWriter.write(creationStr);
			fileWriter.write("\t");
		
			//EMAIL
			fileWriter.write(order.getCustomerEmail());
			fileWriter.write("\t");
		
			//ITEMTITLE
			fileWriter.write(TurnToHelper.replaceNull(product.getName(), ""));
			fileWriter.write("\t");
		
			//ITEMURL
			fileWriter.write(URLUtils.http('Product-Show', 'pid', product.getID()).toString());
			fileWriter.write("\t");
		
			//ITEMLINEID
			fileWriter.write("\t");
		
			//ZIP
			var billingAddress : OrderAddress = order.getBillingAddress();
			fileWriter.write(billingAddress.getPostalCode());
			fileWriter.write("\t");
		
			//FIRSTNAME
			fileWriter.write(TurnToHelper.replaceNull(billingAddress.getFirstName(), ""));
			fileWriter.write("\t");
		
			//LASTNAME
			fileWriter.write(TurnToHelper.replaceNull(billingAddress.getLastName(), ""));
			fileWriter.write("\t");
		
			//SKU
			fileWriter.write(TurnToHelper.replaceNull(product.getID(), ""));
			fileWriter.write("\t");
		
			//PRICE
			fileWriter.write(productLineItem.getAdjustedNetPrice().getValue().toString());
			fileWriter.write("\t");
		
			//ITEMIMAGEURL
			var image : MediaFile = product.getImage("large", 0);
			if (image == null){
				image = product.getImage("medium", 0);
			}
			if (image == null){
				image = product.getImage("small", 0);
			}
			if (image == null){
				image = product.getImage("swatch", 0);
			}
		
			if (image != null) {
				fileWriter.write(image.getAbsURL().toString());
			}
			fileWriter.write("\t");
		
			//TEASERSHOWN
			fileWriter.write("\t");
		
			//TEASERCLICKED
			fileWriter.write("\t");
		
			//DELIVERYDATE
			var shipment = productLineItem.getShipment();
			if (shipment) {
				var deliveryDate : Date = shipment.getCreationDate();
				var deliveryDateString = dw.util.StringUtils.formatCalendar(new Calendar(deliveryDate), "yyyy-MM-dd hh:mm:ss");
				fileWriter.write(deliveryDateString);
			}
			fileWriter.write("\t");
		
			//NICKNAME
			fileWriter.write("\t");
		
			//LOCALE
			fileWriter.write(currentLocale);
		
			fileWriter.write("\n");
		}
		return;
	}
}

module.exports = OrderWriterHelper;
