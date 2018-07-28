module.exports = function oilsRenderTable(pluginConf, web, next) {
	web.renderTable = renderTable;
	web.utils.getTableFromModel = getTableFromModel;
	web.utils.getCleanQuery = getQueryWithoutTableParams;

	pluginConf = web.utils.extend(pluginConf, require('./conf.js'));
	const async = require('async');

	function getTableFromModel(ModelObj, opts, callback) {
		return new Promise(function(resolve, reject) {

			let tableObj = new Object();
			tableObj.tableId = opts.tableId;
			tableObj.rowsPerPage = opts.rowsPerPage;
			if (!tableObj.rowsPerPage) {
				tableObj.rowsPerPage = pluginConf.defaultRowsPerPage;
			}

			let pageNo = opts.pageNo || 1;
			let sort = opts.sort;

			tableObj.addtlQuery = opts.addtlQuery;

			let query1 = opts.query;
			let query2 = null;
			if (Array.isArray(query1)) {
				query1 = opts.query[0];
				query2 = opts.query[1];
			}
			
			ModelObj.countDocuments(query1).exec(function(err, count) {
				let maxPage = Math.ceil(count/tableObj.rowsPerPage);
				if (pageNo > maxPage) {
					pageNo = maxPage;
				}
				if (pageNo < 1) {
					pageNo = 1;
				}

				let populate = opts.populate || '';

				ModelObj.find(query1, query2)
					.lean()
					.populate(populate)
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
							let pagination = null;

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
								for (let i = pagination.startPage; i<=pagination.endPage; i++) {
									pagination.pages.push(i);
								}

							}

							tableObj.pagination = pagination;

							resolve(tableObj);
							if (callback) {
								callback(null, tableObj);
							}
						})
			        })
			    })
		});

	}

	function renderTable(req, ModelObj, opts, callback) {

		return new Promise(function(resolve, reject) {
			opts.tableId = opts.tableId || getPrefix(ModelObj);
			opts.pageNo = req.query[opts.tableId + '_p'] || 1;
			opts.addtlQuery = getQueryWithoutTableParams(req.query, opts.tableId);
			opts.tableTemplate = opts.tableTemplate || (pluginConf.pluginPath + '/templates/table.html')
			web.utils.getTableFromModel(ModelObj, opts, function(err, tableObj) {
				web.templateEngine.render(opts.tableTemplate, {table: tableObj}, function(err, resultStr) {

					if (err) {
						reject(err);
					} else {
						resolve(resultStr);
					}

					if (callback) {
	        	callback(err, resultStr, tableObj);
	        }
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
		let escapedVal = web.templateEngine.filters.escape(record[key]);
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
		let qArr = [];
		for (let i in q) {
			if (!startsWith(i, tableId)) {
				qArr.push(i + "=" + encodeURIComponent(q[i]));
			}
			
		}

		return qArr.join("&");
	}

	next();
}