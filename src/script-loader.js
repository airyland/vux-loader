'use strict'

const utils = require('loader-utils')
const fs = require('fs')
const i18nReplaceForScript = require('../libs/replace-i18n-for-script').replace
const getI18nBlockWithLocale = require('../libs/get-i18n-block').getWithLocale
const path = require('path')

module.exports = function (source) {
  this.cacheable()
  const _this = this
  const config = this.k12vux || utils.getLoaderConfig(this, 'k12vux')
  if (!config.plugins || !config.plugins.length) {
    return source
  }

  let i18nPlugin
  const i18nPluginsMatch = config.plugins.filter(function (one) {
    return one.name === 'i18n'
  })
  if (i18nPluginsMatch.length) {
    i18nPlugin = i18nPluginsMatch[0]
  }
  let isVuxVueFile = this.resourcePath.replace(/\\/g, '/').indexOf('k12vux/src/components') > -1
  if (config.options.k12vuxDev && this.resourcePath.replace(/\\/g, '/').indexOf('src/components') > -1) {
    isVuxVueFile = true
  }

  const isVuxComponent = this.resourcePath.replace(/\\/g, '/').indexOf('/k12vux/src/components') > -1

  if (config.plugins.length) {
    config.plugins.forEach(function (plugin) {
      // script-parser
      if (plugin.name === 'script-parser') {
        if (plugin.fn) {
          source = plugin.fn.call(_this, source)
        }
      }
    })
  }

  // 按需加载Vue组件
  if (config.options.useVuxUI && /}\s+from(.*?)('|")k12vux/.test(source)) {
    const maps = this.k12vuxMaps || utils.getLoaderConfig(this, 'k12vuxMaps')
    const parser = require('./libs/import-parser')
    source = parser(source, function (opts) {
      let str = ''
      opts.components.forEach(function (component) {
        let file = `k12vux/${maps[component.originalName]}`
        if (config.options.k12vuxDev) {
          if (/App\.vue/.test(_this.resourcePath)) {
            file = file.replace(/k12vux\/src/g, '.')
          } else {
            let relative = '..'
            // component file import other functions
            if (isVuxComponent && !/components/.test(file)) {
              relative = '../..'
            }

            if (/demos/.test(_this.resourcePath)) {
              const splits = _this.resourcePath.split('demos')[1].split(path.sep).length - 1
              let dir = []
              for (let i = 0; i < splits; i++) {
                dir.push('..')
              }
              relative = dir.join('/')
            }

            if (config.options.resolveVuxDir) {
              relative = config.options.resolveVuxDir
            }

            file = file.replace(/k12vux\/src/g, relative)
          }
        }
        str += `import ${component.newName} from '${file}'\n`
      })
      return str
    }, 'k12vux')
  }

  if (config.options.k12vuxWriteFile === true) {
    fs.writeFileSync(this.resourcePath + '.k12vux.js', source)
  }

  if (i18nPlugin && !isVuxVueFile && source.indexOf(`$t('`) > -1 && i18nPlugin.staticReplace === true) {
    const rs = getI18nBlockWithLocale({
      code: _this.resourcePath,
      isFile: true,
      locale: i18nPlugin.k12vuxLocale || 'zh-CN'
    })
    source = i18nReplaceForScript(source, rs)
  }

  return source
}

function camelCaseToDash(str) {
  return str.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase()
}