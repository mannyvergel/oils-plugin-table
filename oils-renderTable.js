module.exports = function oilsRenderTable(pluginConf, web, next) {
	web.renderTable = renderTable;
	web.utils.getTableFromModel = getTableFromModel;
	web.utils.getCleanQuery = getQueryWithoutTableParams;

	pluginConf = web.utils.extend(pluginConf, require('./conf.js'));
	var async = require('async');

	function getTableFromModel(ModelObj, opts, callback) {
		var tableObj = new Object();
		tableObj.tableId = opts.tableId;
		tableObj.rowsPerPage = opts.rowsPerPage;
		if (!tableObj.rowsPerPage) {
			tableObj.rowsPerPage = pluginConf.defaultRowsPerPage;
		}

		var pageNo = opts.pageNo || 1;
		var sort = opts.sort;

		tableObj.addtlQuery = opts.addtlQuery;
		
		ModelObj.count(opts.query).exec(function(err, count) {
			var maxPage = Math.ceil(count/tableObj.rowsPerPage);
			if (pageNo > maxPage) {
				pageNo = maxPage;
			}
			if (pageNo < 1) {
				pageNo = 1;
			}

			ModelObj.find(opts.query)
				.lean()
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

						tableObj.pagination = pagination;
						callback(null, tableObj);
					})
		        })
		    })
	}

	function renderTable(req, ModelObj, opts, callback) {
		opts.tableId = opts.tableId || getPrefix(ModelObj);
		opts.pageNo = req.query[opts.tableId + '_p'] || 1;
		opts.addtlQuery = getQueryWithoutTableParams(req.query, opts.tableId);
		web.utils.getTableFromModel(ModelObj, opts, function(err, tableObj) {
			web.templateEngine.render(pluginConf.pluginPath + '/templates/table.html', {table: tableObj}, function(err, resultStr) {
			            	callback(err, resultStr);
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

	function startsWith(str, prefix) {
	  return str.substr(0, prefix.length) == prefix;
	}

	function getQueryWithoutTableParams(q, tableId) {
		var qArr = [];
		for (var i in q) {
			if (!startsWith(i, tableId)) {
				qArr.push(i + "=" + encodeURIComponent(q[i]));
			}
			
		}

		return qArr.join("&");
	}

	next();
}