'use strict';

const pluginConf = web.plugins['oils-plugin-table'].conf;

module.exports = {
	defaultRowsPerPage: 10,
  defaultSequentialHandleExecution: false,
  shouldConvertEscapedValueToLocaleString: false,
  tableTemplate: pluginConf.pluginPath + '/templates/table.html',
}