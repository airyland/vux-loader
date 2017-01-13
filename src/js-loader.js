'use strict'

const utils = require('loader-utils')
const path = require('path')

module.exports = function (source) {
  this.cacheable()
  const _this = this
  const vuxConfig = this.vux || utils.getLoaderConfig(this, 'vux')
 
  if (vuxConfig.options.useVuxUI && /}\s+from(.*?)'vux/.test(source)) {
    const parser = require('./libs/import-parser')
    const maps = this.vuxMaps || utils.getLoaderConfig(this, 'vuxMaps')
    source = parser(source, function (opts) {
      let str = ''
      opts.components.forEach(function (component) {
        let file = `vux/${maps[component.originalName]}`
        if (vuxConfig.options.vuxDev) {
          file = file.replace('vux/src/', './')
        }
        str += `import ${component.newName} from '${file}'\n`
      })
      return str
    }, 'vux')
    
  }

  if(vuxConfig.options.vuxDev && /main\.js/.test(this.resourcePath)) {
    source = source.replace(/!vux\/src/g, '!.')
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