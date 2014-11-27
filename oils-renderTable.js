module.exports = function oilsRenderTable(pluginConf, web, next) {
	pluginConf = web.utils.extend(pluginConf, require('./conf.js'));
	var async = require('async');
	web.renderTable = function(ModelObj, req, opts, callback) {
		var tableObj = new Object();
		tableObj.rowsPerPage = opts.rowsPerPage;
		if (!tableObj.rowsPerPage) {
			tableObj.rowsPerPage = pluginConf.defaultRowsPerPage;
		}

		tableObj.tableId = opts.tableId || getPrefix(ModelObj);
		var pageNo = req.query[tableObj.tableId + '_p'] || 1;
		var sort = opts.sort;


		
		ModelObj.count(opts.query).exec(function(err, count) {
			var maxPage = Math.ceil(count/tableObj.rowsPerPage);
			if (pageNo > maxPage) {
				pageNo = maxPage;
			}
			if (pageNo < 1) {
				pageNo = 1;
			}

			ModelObj.find(opts.query)
			    .select(opts.columns.join(' '))
			    .limit(tableObj.rowsPerPage)
			    .skip(tableObj.rowsPerPage * (pageNo-1))
			    .sort(sort)
			    .exec(function(err, records) {
		        
		        	
		        	tableObj.columns = opts.columns;
		        	tableObj.labels = opts.labels || opts.columns;
					tableObj.count = count;
					tableObj.noRecordsFoundLabel = "No records found.";

					assignAllHandlers(opts.handlers, records, opts.columns, function(err, records) {
						tableObj.records = records;    	
						var pagination = null;

						if (count > tableObj.rowsPerPage) {
							pagination = new Object();
							pagination.pageNo = pageNo;
							pagination.totalPage = maxPage;
							//console.log('!!!' + pagination.totalPage);
							pagination.startPage = pageNo < 5 ? 1 : pageNo - 4;
							pagination.endPage = 8 + pagination.startPage;
							pagination.endPage = pagination.totalPage < pagination.endPage ? pagination.totalPage : pagination.endPage;
							pagination.diff = pagination.startPage - pagination.endPage + 8;
							pagination.startPage -= ((pagination.startPage - pagination.diff) > 0) ? pagination.diff : 0;
							pagination.pages = [];
							for (var i = pagination.startPage; i<=pagination.endPage; i++) {
								pagination.pages.push(i);
							}

						}
			            web.templateEngine.render(pluginConf.pluginPath + '/templates/table.html', {table: tableObj, pagination: pagination}, function(err, resultStr) {
			            	callback(err, resultStr);
			            })
					})
		        })
		    })

	}


	function getPrefix(ModelObj) {
		return ModelObj.modelName.toLowerCase();
	}

	function assignAllHandlers(handlers, records, columns, assignAllHandlersCallback) {
		handlers = handlers || new Object();


		async.each(records, function(record, callback) {

			async.each(columns, function(column, columnsCallback) {
	
				if (!handlers[column]) {
					handlers[column] = defaultHandler;
				}

				assignHandler(column, handlers[column], record, columnsCallback);
			
			}, function(err) {
				callback();
			})
			
		}, function(err) {
			assignAllHandlersCallback(err, records);
		})

		
	}

	function assignHandler(key, handler, record, callback) {
		var escapedVal = web.templateEngine.filters.escape(record[key]);
		handler(record, key, escapedVal, function(err, value) {
			record[key] = value;
			callback();
		})
	}

	function defaultHandler(record, column, escapedVal, callback) {
		callback(null, escapedVal);
	}

	next();
}