const utils = require('loader-utils')

module.exports = function (source) {
  this.cacheable()

  const config = utils.getLoaderConfig(this, "vux")
  if (!config.plugins || !config.plugins.length) {
    return source
  }

  config.plugins.forEach(function (plugin) {
    // style-parser
    if (plugin.name === 'style-parser') {
      if (plugin.fn) {
        source = plugin.fn.call(plugin.fn, source)
      }
    }
  })

  return importParser(source)
}

function importParser(source) {
  return source
}