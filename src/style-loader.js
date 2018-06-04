'use strict'

const utils = require('loader-utils')

module.exports = function (source) {
  this.cacheable()
  const _this = this
  const config = this.k12vux || utils.getLoaderConfig(this, 'k12vux')

  if (!config.plugins || !config.plugins.length) {
    return source
  }

  config.plugins.forEach(function (plugin) {
    // style-parser
    if (plugin.name === 'style-parser') {
      if (plugin.fn) {
        source = plugin.fn.call(_this, source)
      }
    }
  })

  if (config.options.k12vuxDev) {
    if (/App\.vue$/.test(this.resourcePath)) {
      source = source.replace(/~k12vux\/src/g, '.')
    } else {
      if (config.options.resolveVuxDir) {
        // if (_this.resourcePath.includes('pages') && _this.resourcePath.includes('IconLoading') )
        // source = source.replace(/~k12vux\/src/g, config.options.resolveVuxDir).replace('//', '/')
        // if (_this.resourcePath.includes('pages') && _this.resourcePath.includes('IconLoading') )
      } else {
        source = source.replace(/~k12vux\/src/g, '..')
      }
    }
  }

  return source
}
