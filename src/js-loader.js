const utils = require('loader-utils')

module.exports = function (source) {
  this.cacheable()

  const maps = utils.getLoaderConfig(this, "vuxMaps")
  const vuxConfig = utils.getLoaderConfig(this, "vux")

  if (vuxConfig.options.useVuxUI && /}\s+from(.*?)'vux/.test(source)) {
    const parser = require('./libs/import-parser')
    source = parser(source, function (opts) {
      let str = ''
      opts.components.forEach(function (component) {
        str += `import ${component.newName} from 'vux/${maps[component.originalName]}'\n`
      })
      return str
    }, 'vux')
  }

  if (vuxConfig.plugins.length) {
    vuxConfig.plugins.forEach(function (plugin) {
      // js-parser
      if (plugin.name === 'js-parser') {
        if (plugin.fn) {
          source = plugin.fn.call(plugin.fn, source)
        }
      }
    })
  }
  return source
}