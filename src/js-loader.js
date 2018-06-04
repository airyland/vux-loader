'use strict'

const utils = require('loader-utils')
const path = require('path')
const pkg = require('../package')

module.exports = function (source) {
  this.cacheable()
  const _this = this
  const k12vuxConfig = this.k12vux || utils.getLoaderConfig(this, 'k12vux')
 
  if (k12vuxConfig.options.useVuxUI && /}\s+from(.*?)('|")k12vux/.test(source)) {
    const parser = require('./libs/import-parser')
    const maps = this.k12vuxMaps || utils.getLoaderConfig(this, 'k12vuxMaps')
    source = parser(source, function (opts) {
      let str = ''
      opts.components.forEach(function (component) {
        let file = `k12vux/${maps[component.originalName]}`
        if (k12vuxConfig.options.k12vuxDev) {
          if (k12vuxConfig.options.resolveVuxDir) {
            file = file.replace('k12vux/src/', k12vuxConfig.options.resolveVuxDir)
          } else {
            file = file.replace('k12vux/src/', './')
          }
        }
        str += `import ${component.newName} from '${file}'\n`
      })
      return str
    }, 'k12vux')
    
  }

  if(k12vuxConfig.options.k12vuxDev && /main\.js/.test(this.resourcePath)) {
    source = source.replace(/!k12vux\/src/g, '!.')
  }

  if (k12vuxConfig.plugins.length) {
    k12vuxConfig.plugins.forEach(function (plugin) {
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

  /**
  if (/main\.js/.test(this.resourcePath) && process.env.NODE_ENV === 'development') {
    if (this.options && this.options.context) {
      const pkgPath = k12vuxConfig.options.k12vuxDev ? path.join(this.options.context, 'package.json') : path.join(this.options.context, 'node_modules/k12vux/package.json')
      const k12vuxPkg = require(pkgPath)
      const webpackPath = path.join(this.options.context, 'node_modules/webpack/package.json')
      const webpackPkg = require(webpackPath)
      const nodeVersion = process.version.match(/^v(\d+\.\d+)/)[1]
      const style = 'background: #35495e; color: yellow;'
      if (typeof k12vuxConfig.options.showVuxVersionInfo === 'undefined' || k12vuxConfig.options.showVuxVersionInfo === true) {
        source += `\n;console.info('[VUX] %ck12vux@${k12vuxPkg.version}, k12vux-loader@${pkg.version}, webpack@${webpackPkg.version}, node@${nodeVersion}\\n%c[VUX] 建议反馈请访问 https://github.com/airyland/k12vux/issues \\n[VUX] 关闭该提示请在 k12vux-loader 配置  options: { showVuxVersionInfo: false }', '${style}', '')`
      }
    }
  }
  **/

  return source
}