'use strict'

const utils = require('loader-utils')
const yamlReader = require('js-yaml')
const fs = require('fs')
const path = require('path')
const matchI18nReg = /\$t\('?(.*?)'?\)/g
const getName = function (path) {
  return path.replace(/\\/g, '/').split('components')[1].replace('index.vue', '').replace(/\//g, '')
}

module.exports = function (source) {
  const _this = this
  this.cacheable()
  const query = utils.parseQuery(this.query)
  const config = utils.getLoaderConfig(this, 'vux')
  if (!config.plugins || !config.plugins.length) {
    return source
  }
  const basename = path.basename(this.resourcePath)
  const isVuxVueFile = this.resourcePath.replace(/\\/g, '/').indexOf('/vux/src/components') > -1
  const locales = utils.getLoaderConfig(this, 'vuxLocales')

  /**
   * ======== i18n ========
   */
  let dynamic = false
  let locale = 'zh-CN'
    // 如果不设置, dynamic 为false, local 为 zh-CN
  const i18nPluginsMatch = config.plugins.filter(function (one) {
    return one.name === 'i18n'
  })
  if (i18nPluginsMatch.length) {
    dynamic = !!i18nPluginsMatch[0].dynamic
    locale = i18nPluginsMatch[0].locale || 'zh-CN'
  } else {
    // 不指定i18n,则默认为dynamic为false
    dynamic = false
    locale = 'zh-CN'
  }

  if ((isVuxVueFile) && source.indexOf("$t(") > -1) {
    const name = getName(this.resourcePath)
    if (!dynamic) {
      source = source.replace(matchI18nReg, function (a, b) {
        let key = `vux.${name}.${b}`
        if (a.indexOf("'") > -1) { // 用于翻译字符
          return "'" + locales[key][locale] + "'"
        } else { // 用于翻译变量，如 $t(text)
          return b
        }
      })
    } else {
      // dynamic 为 true, 则对于 vux 源码，把 key 加上 prefix
      source = source.replace(matchI18nReg, function (a, b) {
        if (a.indexOf("'") > -1) {
          return a.replace(b, `vux.${name}.${b}`)
        } else {
          return a
        }
      })
    }
  }

  config.plugins.forEach(function (plugin) {

    // template-feature-switch
    /**
    <off feature="false"> show
    <on feature="true"> show

    <off feature="true"> hide
    <on feature="false"> hide
    */

    if (plugin.name === 'template-feature-switch') {
      // replace features
      if (plugin.features && source.indexOf('</on>') > -1) {
        source = parseOnFeature(source, plugin.features)
      }
      if (plugin.features && source.indexOf('</off>') > -1) {
        source = parseOffFeature(source, plugin.features)
      }
    }

    // 非 vux 组件才需要生成语言
    if (!isVuxVueFile && plugin.name === 'i18n') {
      const globalConfigPath = 'src/locales/global_locales.yml'
      const componentsConfigPath = 'src/locales/components_locales.yml'
      const isDynamic = !!plugin.dynamic

      if (isDynamic) {
        // 异步写到语言文件里，不然很难实现 live reload
        // 根据identifier,直接覆盖相关内容
        setTimeout(function () {
          const rawFileContent = fs.readFileSync(_this.resourcePath, 'utf-8')
          const results = rawFileContent.match(/<i18n[^>]*>([\s\S]*?)<\/i18n>/)
          if (results) {
            let attrsMap = {}
            const attrs = results[0].split('\n')[0].replace('<i18n', '')
              .replace('>', '')
              .replace(/"/g, '')
              .replace(/\r/g, '')
              .split(' ')
              .filter(function (one) {
                return !!one
              }).forEach(function (one) {
                let tmp = one.split('=')
                attrsMap[tmp[0]] = tmp[1]
              })

            const filePath = path.resolve(config.options.projectRoot, componentsConfigPath)
            try {
              const local = yamlReader.safeLoad(results[1])
                // 读取已经存在的语言文件
              let finalConfig = {}
              let currentConfig = fs.readFileSync(filePath, 'utf-8')
              if (!currentConfig) {
                finalConfig = local
              } else {
                finalConfig = Object.assign(yamlReader.safeLoad(currentConfig), local)
              }
              if (!currentConfig || (currentConfig && JSON.stringify(yamlReader.safeLoad(currentConfig)) !== JSON.stringify(finalConfig))) {
                fs.writeFileSync(filePath, yamlReader.safeDump(finalConfig))
              }
            } catch (e) {
              console.log('yml 格式有误，请重新检查')
            }

          }
        })
      }
    }

    // template-parser
    if (plugin.name === 'template-parser') {
      if (plugin.fn) {
        source = plugin.fn.call(plugin.fn, source)
      }
      if (plugin.replaceList && plugin.replaceList.length) {
        plugin.replaceList.forEach(function (replacer) {
          source = source.replace(replacer.test, replacer.replaceString)
        })
      }
    }
    // i18n
    /**
    if (plugin.name === 'i18n') {
      const language = plugin.language
      if (plugin.test.test(_this.resourcePath)) {
        const basename = path.basename(_this.resourcePath)
        const localeFile = _this.resourcePath.replace(basename, `locales/${language}.yml`)
        try {
          const locales = yamlReader.safeLoad(fs.readFileSync(localeFile, 'utf-8'))
          for (let i in locales) {
            source = source.replace(new RegExp(`__\\('${i}'\\)`, 'g'), `'${locales[i]}'`)
          }
          if (plugin.watch) {
            _this.addDependency(localeFile)
          }
        } catch (e) {
          console.log(`locales for ${basename} doesn't exist`)
        }
      }
    }
    **/

    if (plugin.name === 'template-string-append') {
      if (new RegExp(plugin.test).test(_this.resourcePath)) {
        var componentName = basename.replace('.vue', '').toLowerCase()
        var string = plugin.fn({
          resourcePath: _this.resourcePath,
          basename: basename
        })
        if (string) {
          source = source.replace(/\s+$/g, '').replace(/\\n/g, '').replace(/<\/div>$/, string + '</div>')
        }
      }
    }
  })

  return source
}

function parseOnFeature(content, features) {
  content = content.replace(/<on[^>]*>([\s\S]*?)<\/on>/g, function (tag, text) {
    const key = tag.split('\n')[0].replace('<on', '')
      .replace('>', '')
      .replace(/"/g, '')
      .replace(/\r/g, '')
      .split(' ')
      .filter(function (one) {
        return !!one
      }).map(function (one) {
        let tmp = one.split('=')
        return tmp[1]
      })
    if (features[key] && features[key] === true) {
      // true
      return text
    } else {
      // false
      return ''
    }
  })
  return content
}

function parseOffFeature(content, features) {
  content = content.replace(/<off[^>]*>([\s\S]*?)<\/off>/g, function (tag, text) {
    const key = tag.split('\n')[0].replace('<off', '')
      .replace('>', '')
      .replace(/"/g, '')
      .replace(/\r/g, '')
      .split(' ')
      .filter(function (one) {
        return !!one
      }).map(function (one) {
        let tmp = one.split('=')
        return tmp[1]
      })
    if (!features[key]) {
      // false
      return text
    } else {
      // true
      return ''
    }
  })
  return content
}