'use strict';

module.exports = function oilsRenderTable(pluginConf, web, next) {
	web.renderTable = renderTable;
	web.utils.getTableFromModel = getTableFromModel;
	web.utils.getCleanQuery = getQueryWithoutTableParams;

	pluginConf = web.utils.extend(require('./conf.js'), pluginConf || {});

	async function getTableFromModel(ModelObj, opts, callback) {
		let tableObj = new Object();
		tableObj.tableId = opts.tableId;
		tableObj.rowsPerPage = opts.rowsPerPage;
		if (!tableObj.rowsPerPage) {
			tableObj.rowsPerPage = pluginConf.defaultRowsPerPage;
		}

		
		let sort = opts.sort;

		tableObj.addtlQuery = opts.addtlQuery;
		tableObj.pageLimit = opts.pageLimit;

		let query1 = opts.query;
		let query2 = null;
		if (Array.isArray(query1)) {
			query1 = opts.query[0];
			query2 = opts.query[1];
		}

		opts.sequentialHandleExecution = opts.sequentialHandleExecution || pluginConf.defaultSequentialHandleExecution;

		//mongoose backwards compat
		if (!ModelObj.countDocuments) {
			ModelObj.countDocuments = ModelObj.count;
		}


		
		let count = await ModelObj.countDocuments(query1).exec();

		let pageNo = opts.pageNo || 1;
		
		let maxPage = tableObj.pageLimit || Math.ceil(count/tableObj.rowsPerPage);

		if (pageNo === "last") {
			pageNo = maxPage;
		}
		if (pageNo > maxPage) {
			pageNo = maxPage;
		}
		if (pageNo < 1) {
			pageNo = 1;
		}
		
		tableObj.pageNo = pageNo;

		let populate = opts.populate || '';

		let modelBuild = ModelObj.find(query1, query2)
			
			.populate(populate)
	    .limit(tableObj.rowsPerPage)
	    .skip(tableObj.rowsPerPage * (pageNo-1))
	    .sort(sort)
		
		if (opts.lean === undefined) {
			opts.lean = true;
		}

		if (opts.includeVirtuals) {
			opts.lean = false;
		}

	  if (opts.lean) {
	  	modelBuild.lean()
	  }

	  let records = await	modelBuild.exec();

	  opts.columns = opts.columns || opts.cols;
		tableObj.columns = opts.columns.map(a=>(web.objectUtils.isString(a) ? a : a.id));
		tableObj.labels = opts.labels || tableObj.columns;

		tableObj.headerOpts = opts.headerOpts || headerOptsFromColumns(opts.columns);
		for (let i=0; i<tableObj.columns.length; i++) {
			let col = tableObj.columns[i];
			if (!tableObj.headerOpts[col]) {
				tableObj.headerOpts[col] = {};
			}

			if (tableObj.headerOpts[col].label === undefined) {
				tableObj.headerOpts[col].label = tableObj.labels[i];
			}

			if (tableObj.headerOpts[col].width) {
				if (!tableObj.headerOpts[col].style) {
					tableObj.headerOpts[col].style = "";
				}
				tableObj.headerOpts[col].style = "width: " + web.stringUtils.escapeHTML(tableObj.headerOpts[col].width) + "; " + tableObj.headerOpts[col].style;
			}
		}

		tableObj.count = count;

		await assignAllHandlers(tableObj, opts, records);

		tableObj.records = records;

	  if (opts.afterFindRecords) {
	  	await opts.afterFindRecords(records, tableObj, opts);
	  }

	  tableObj.noRecordsFoundLabel = opts.noRecordsFoundLabel || "No records found.";
		tableObj.noRecordsFoundHtml = opts.noRecordsFoundHtml || web.stringUtils.escapeHTML(tableObj.noRecordsFoundLabel);

		let pagination = null;

		if (maxPage > 1) {
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

		if (callback) {
			callback(null, tableObj);
		}

		return tableObj;
	}

	function renderTable(req, ModelObj, opts, callback) {

		return new Promise(function(resolve, reject) {
			opts.tableId = opts.tableId || getPrefix(ModelObj);
			opts.pageNo = req.query[opts.tableId + '_p'] || 1;
			opts.addtlQuery = getQueryWithoutTableParams(req.query, opts.tableId);
			opts.addtlTableClass = opts.addtlTableClass ? (" " + opts.addtlTableClass) : "";
			opts.tableTemplate = opts.tableTemplate || (pluginConf.pluginPath + '/templates/table.html')
			web.utils.getTableFromModel(ModelObj, opts, function(err, tableObj) {
				web.templateEngine.render(opts.tableTemplate, {table: tableObj, addtlTableClass: opts.addtlTableClass}, function(err, resultStr) {

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

	async function assignAllHandlers(tableObj, opts, records, assignAllHandlersCallback) {
		let handlers = opts.handlers || new Object();
		let recordHandler = opts.recordHandler;
		let columns = tableObj.columns;
		let sequentialHandleExecution = opts.sequentialHandleExecution;


		if (records) {
			let handlerPromises = [];
			for (let record of records) {
				if (recordHandler) {
					await recordHandler(record, opts);
				}
				
				for (let column of columns) {
					let currHandler = handlers[column] 
					  || (tableObj.headerOpts[column] && tableObj.headerOpts[column].handler)
					  || defaultHandler;
					

					if (sequentialHandleExecution) {
						await execHandlerPromise(column, currHandler, record);
					} else {
						handlerPromises.push(execHandlerPromise(column, currHandler, record));
					}
					
				}
			}

			if (!sequentialHandleExecution) {
				await Promise.all(handlerPromises);
			}
		} else {
			console.warn("table records not found.");
		}
		
	}

	function execHandlerPromise(key, handler, record) {
		return new Promise(function(resolve, reject) {
			let rawVal = record[key];
			let escapedVal; 
			if (rawVal !== null && rawVal !== undefined) {
				if (pluginConf.shouldConvertEscapedValueToLocaleString) {
					escapedVal = web.stringUtils.escapeHTML(rawVal && rawVal.toLocaleString());
				} else {
					escapedVal = web.stringUtils.escapeHTML(rawVal);
				}
			} else {
				escapedVal = '';
			}
			let maybePromise = handler(record, key, escapedVal, function(err, value) {
				record[key] = value;
				resolve();
			});

			if (maybePromise) {
				maybePromise.then(function(val) {
					record[key] = val;
					resolve();
				});
			}
		})
		
	}

	async function defaultHandler(record, column, escapedVal) {
		return escapedVal;
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

	function headerOptsFromColumns(columns) {
		let headerOpts = {};
		for (let colOpt of columns) {
			if (colOpt && !web.objectUtils.isString(colOpt)) {
				headerOpts[colOpt.id] = colOpt;
			} else {
				// colOpt is a string
				headerOpts[colOpt] = {};
			}
		}

		return headerOpts;
	}

	next();
}