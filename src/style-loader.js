'use strict'

const utils = require('loader-utils')

module.exports = function (source) {
  this.cacheable()

  const config = this.vux || utils.getLoaderConfig(this, 'vux')

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

  if (config.options.vuxDev) {
    if (/App\.vue$/.test(this.resourcePath)) {
      source = source.replace(/~vux\/src/g, '.')
    } else {
      source = source.replace(/~vux\/src/g, '..')
    }
  }

  return source
}
