const utils = require('loader-utils')

module.exports = function (source) {
  this.cacheable()
  const _this = this
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
          if (plugin.test && plugin.test.test(_this.resourcePath)) {
            source = plugin.fn.call(_this, source)
          } else if (!plugin.test) {
            source = plugin.fn.call(_this, source)
          }
        }
      }
    })
  }
  return source
}