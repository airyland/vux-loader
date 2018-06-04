'use strict'

const path = require('path')
const fs = require('fs')
const merge = require('webpack-merge')
const utils = require('loader-utils')
const less = require('less')
const yaml = require('js-yaml')
const _ = require('lodash')
const pkg = require('../package')

var webpack = require('webpack')

const scriptLoader = path.join(__dirname, './script-loader.js')
const styleLoader = path.join(__dirname, './style-loader.js')
const templateLoader = path.join(__dirname, './template-loader.js')
const jsLoader = path.join(__dirname, './js-loader.js')
const afterLessLoader = path.join(__dirname, './after-less-loader.js')
const beforeTemplateCompilerLoader = path.join(__dirname, './before-template-compiler-loader.js')

const projectRoot = process.cwd()

const getLessVariables = require('./libs/get-less-variables')

/**
 * Plugins
 */
const htmlBuildCallbackPlugin = require('../plugins/html-build-callback')
const DuplicateStyle = require('../plugins/duplicate-style')

/** build done callback **/

function DonePlugin(callbacks) {
  this.callbacks = callbacks || function () {}
    // Setup the plugin instance with options...
}

DonePlugin.prototype.apply = function (compiler) {
  let callbacks = this.callbacks
  compiler.plugin('done', function () {
    callbacks.forEach(function (fn) {
      fn()
    })
  });
};

/** emit plugin **/
function EmitPlugin(callback) {
  this.callback = callback
}

EmitPlugin.prototype.apply = function (compiler) {
  let callback = this.callback
  compiler.plugin("emit", function (compilation, cb) {
    callback(compilation, cb)
  });
};

module.exports = function (source) {
  const SCRIPT = utils.stringifyRequest(this, scriptLoader).replace(/"/g, '')
  const STYLE = utils.stringifyRequest(this, styleLoader).replace(/"/g, '')
  const AFTER_LESS_STYLE = utils.stringifyRequest(this, afterLessLoader).replace(/"/g, '')
  const TEMPLATE = utils.stringifyRequest(this, templateLoader).replace(/"/g, '')
  const BEFORE_TEMPLATE_COMPILER = utils.stringifyRequest(this, beforeTemplateCompilerLoader).replace(/"/g, '')


  const variableMap = this.k12vuxVariableMap || utils.getLoaderConfig(this, 'k12vuxVariableMap')

  var query = this.query ? utils.parseQuery(this.query) : {}
  this.cacheable()
  if (!source) return source
  const config = this.k12vux || utils.getLoaderConfig(this, 'k12vux')
  if (!config) {
    return source
  }

  let variables = ''
  var themes = config.plugins.filter(function (plugin) {
    return plugin.name === 'less-theme'
  })

  if (themes.length) {
    const themePath = path.join(config.options.projectRoot, themes[0].path)
    this.addDependency(themePath)
    variables = getLessVariables(themes[0].path)
    for (let i in variables) {
      if (variableMap[i]) {
        variables[variableMap[i]] = variables[i]
        if (i !== variableMap[i]) {
          delete variables[i]
        }
      }
    }
  }

  source = addScriptLoader(source, SCRIPT)
  source = addStyleLoader(source, STYLE, variables, AFTER_LESS_STYLE)
  source = addTemplateLoader(source, TEMPLATE, BEFORE_TEMPLATE_COMPILER)

  // fix style path in dev mode
  if (config.options.k12vuxDev) {
    source = source.replace(/k12vux\/src\/styles\/(.*?)/g, '../styles/$1')
  }

  return source
}

function hasPlugin(name, list) {
  const match = list.filter(function (one) {
    return one.name === name
  })
  return match.length > 0
}

function getFirstPlugin(name, list) {
  const match = list.filter(function (one) {
    return one.name === name
  })
  return match[0]
}

// merge k12vux options and return new webpack config
module.exports.merge = function (oldConfig, k12vuxConfig) {

  oldConfig = Object.assign({
    plugins: []
  }, oldConfig)

  let config = Object.assign({
    module: {},
    plugins: []
  }, oldConfig)

  if (!k12vuxConfig) {
    k12vuxConfig = {
      options: {},
      plugins: []
    }
  }

  if (!k12vuxConfig.options) {
    k12vuxConfig.options = {
      buildEnvs: ['production']
    }
  }

  if (typeof k12vuxConfig.options.ssr === 'undefined') {
    k12vuxConfig.options.ssr = false
  }

  const buildEnvs = k12vuxConfig.options.buildEnvs || ['production']
  if (buildEnvs.indexOf(process.env.NODE_ENV) !== -1) {
    process.env.__VUX_BUILD__ = true
  } else {
    process.env.__VUX_BUILD__ = false
  }


  if (!k12vuxConfig.plugins) {
    k12vuxConfig.plugins = []
  }

  if (k12vuxConfig.plugins.length) {
    k12vuxConfig.plugins = k12vuxConfig.plugins.map(function (plugin) {
      if (typeof plugin === 'string') {
        return {
          name: plugin
        }
      }
      return plugin
    })
  }

  k12vuxConfig.allPlugins = k12vuxConfig.allPlugins || []

  // check multi plugin instance
  const pluginGroup = _.groupBy(k12vuxConfig.plugins, function (plugin) {
    return plugin.name
  })
  for (let group in pluginGroup) {
    if (pluginGroup[group].length > 1) {
      throw (`only one instance is allowed. plugin name: ${group}`)
    }
  }

  // if exists old k12vux config, merge options and plugins list
  let oldVuxConfig = oldConfig.k12vux || null

  oldConfig.plugins.forEach(function (plugin) {
    if (plugin.constructor.name === 'LoaderOptionsPlugin' && plugin.options.k12vux) {
      oldVuxConfig = plugin.options.k12vux
    }
  })

  if (oldVuxConfig) {
    // merge old options
    k12vuxConfig.options = Object.assign(oldVuxConfig.options, k12vuxConfig.options)
      // merge old plugins list
    k12vuxConfig.plugins.forEach(function (newPlugin) {
      let isSame = false
      oldVuxConfig.allPlugins.forEach(function (oldPlugin, index) {
        if (newPlugin.name === oldPlugin.name) {
          oldVuxConfig.allPlugins.splice(index, 1)
          oldVuxConfig.allPlugins.push(newPlugin)
          isSame = true
        }
      })
      if (!isSame) {
        oldVuxConfig.allPlugins.push(newPlugin)
      }
    })
    k12vuxConfig.allPlugins = oldVuxConfig.allPlugins
  } else {
    k12vuxConfig.allPlugins = k12vuxConfig.plugins
  }

  // filter plugins by env
  if (k12vuxConfig.options.env && k12vuxConfig.allPlugins.length) {
    k12vuxConfig.plugins = k12vuxConfig.allPlugins.filter(function (plugin) {
      return typeof plugin.envs === 'undefined' || (typeof plugin.envs === 'object' && plugin.envs.length && plugin.envs.indexOf(k12vuxConfig.options.env) > -1)
    })
  }

  if (!k12vuxConfig.options.projectRoot) {
    k12vuxConfig.options.projectRoot = projectRoot
  }

  let k12vuxVersion
  try {
    let vuePackagePath = path.resolve(k12vuxConfig.options.projectRoot, 'node_modules/k12vux/package.json')
    k12vuxVersion = require(vuePackagePath).version
  } catch (e) {}

  // get vue version
  let vueVersion
  try {
    let vuePackagePath = path.resolve(k12vuxConfig.options.projectRoot, 'node_modules/vue/package.json')
    vueVersion = require(vuePackagePath).version
  } catch (e) {}
  k12vuxConfig.options.vueVersion = vueVersion

  require('./libs/report')({
    vueVersion: vueVersion,
    k12vuxVersion: k12vuxVersion
  })


  // check webpack version by module.loaders
  let isWebpack2

  if (typeof k12vuxConfig.options.isWebpack2 !== 'undefined') {
    isWebpack2 = k12vuxConfig.options.isWebpack2
  } else if (oldConfig.module && oldConfig.module.rules) {
    isWebpack2 = true
  } else if (oldConfig.module && oldConfig.module.loaders) {
    isWebpack2 = false
  }

  if (typeof isWebpack2 === 'undefined') {
    const compareVersions = require('compare-versions')
    const pkg = require(path.resolve(k12vuxConfig.options.projectRoot, 'package.json'))
    if (pkg.devDependencies.webpack) {
      isWebpack2 = compareVersions(pkg.devDependencies.webpack.replace('^', '').replace('~', ''), '2.0.0') > -1
    } else {
      isWebpack2 = true
    }
  }

  if (!isWebpack2) {
    if (!config.vue) {
      config.vue = {
        loaders: {
          i18n: 'k12vux-loader/src/noop-loader.js'
        }
      }
    } else {
      if (!config.vue.loaders) {
        config.vue.loaders = {}
      }
      config.vue.loaders.i18n = 'k12vux-loader/src/noop-loader.js'
    }
  }

  let loaderKey = isWebpack2 ? 'rules' : 'loaders'

  config.module[loaderKey] = config.module[loaderKey] || []

  const useVuxUI = hasPlugin('k12vux-ui', k12vuxConfig.plugins)
  k12vuxConfig.options.useVuxUI = true

  /**
   * ======== set k12vux options ========
   */
  // for webpack@2.x, options should be provided with LoaderOptionsPlugin
  if (isWebpack2) {
    if (!config.plugins) {
      config.plugins = []
    }
    // delete old config for webpack2
    config.plugins.forEach(function (plugin, index) {
      if (plugin.constructor.name === 'LoaderOptionsPlugin' && plugin.options.k12vux) {
        config.plugins.splice(index, 1)
      }
    })
    config.plugins.push(new webpack.LoaderOptionsPlugin({
      k12vux: k12vuxConfig
    }))
  } else { // for webpack@1.x, merge directly

    config = merge(config, {
      k12vux: k12vuxConfig
    })

  }

  if (hasPlugin('inline-manifest', k12vuxConfig.plugins)) {
    var InlineManifestWebpackPlugin = require('inline-manifest-webpack-plugin')
    config.plugins.push(new InlineManifestWebpackPlugin({
      name: 'webpackManifest'
    }))
  }

  if (hasPlugin('progress-bar', k12vuxConfig.plugins)) {
    const ProgressBarPlugin = require('progress-bar-webpack-plugin')
    const pluginConfig = getFirstPlugin('progress-bar', k12vuxConfig.plugins)
    config.plugins.push(new ProgressBarPlugin(pluginConfig.options || {}))
  }

  if (hasPlugin('k12vux-ui', k12vuxConfig.plugins)) {
    let mapPath = path.resolve(k12vuxConfig.options.projectRoot, 'node_modules/k12vux/src/components/map.json')
    if (k12vuxConfig.options.k12vuxDev) {
      mapPath = path.resolve(k12vuxConfig.options.projectRoot, 'src/components/map.json')
    }
    const maps = require(mapPath)
    if (isWebpack2) {
      config.plugins.push(new webpack.LoaderOptionsPlugin({
        k12vuxMaps: maps
      }))
    } else {
      config = merge(config, {
        k12vuxMaps: maps
      })
    }
  }

  // get less variable alias
  if (hasPlugin('k12vux-ui', k12vuxConfig.plugins)) {
    let variablePath = path.resolve(k12vuxConfig.options.projectRoot, 'node_modules/k12vux/src/styles/variable.less')
    if (k12vuxConfig.options.k12vuxDev) {
      variablePath = path.resolve(k12vuxConfig.options.projectRoot, 'src/styles/variable.less')
    }
    // parse alias

    const rs = {}

    try {
      const content = fs.readFileSync(variablePath, 'utf-8').split('\n').filter(line => /\/\/\salias/.test(line)).map(line => {
        const value = line.split('// alias ')[1].replace(/\s+/g, '').trim()
        const key = line.split('// alias ')[0].replace(/\s+/g, '').trim().split(':')[0].replace(/^@/, '')
        return [key, value]
      }).forEach(one => {
        rs[one[0]] = one[1]
      })
    } catch (e) {}

    if (isWebpack2) {
      config.plugins.push(new webpack.LoaderOptionsPlugin({
        k12vuxVariableMap: rs
      }))
    } else {
      config = merge(config, {
        k12vuxVariableMap: rs
      })
    }
  }

  /**
   * ======== read k12vux locales and set globally ========
   */
  if (hasPlugin('k12vux-ui', k12vuxConfig.plugins)) {
    let k12vuxLocalesPath = path.resolve(k12vuxConfig.options.projectRoot, 'node_modules/k12vux/src/locales/all.yml')
    if (k12vuxConfig.options.k12vuxDev) {
      k12vuxLocalesPath = path.resolve(k12vuxConfig.options.projectRoot, 'src/locales/all.yml')
    }
    try {
      const k12vuxLocalesContent = fs.readFileSync(k12vuxLocalesPath, 'utf-8')
      let k12vuxLocalesJson = yaml.safeLoad(k12vuxLocalesContent)

      if (isWebpack2) {
        config.plugins.push(new webpack.LoaderOptionsPlugin({
          k12vuxLocales: k12vuxLocalesJson
        }))
      } else {
        config = merge(config, {
          k12vuxLocales: k12vuxLocalesJson
        })
      }
    } catch (e) {}
  }

  /**
   * ======== append k12vux-loader ========
   */
  let loaderString = k12vuxConfig.options.loaderString || 'k12vux-loader!vue-loader'
  const rewriteConfig = k12vuxConfig.options.rewriteLoaderString
  if (typeof rewriteConfig === 'undefined' || rewriteConfig === true) {
    let hasAppendVuxLoader = false
    config.module[loaderKey].forEach(function (rule) {
      let hasVueLoader = rule.use && _.isArray(rule.use) && rule.use.length && rule.use.filter(function(one) {
        return one.loader === 'vue-loader'
      }).length === 1
      if (rule.use && typeof rule.use === 'object' && rule.use.loader === 'vue-loader') {
        hasVueLoader = true
      }
      if (rule.loader === 'vue' || rule.loader === 'vue-loader' || hasVueLoader) {
        if (!isWebpack2 || (isWebpack2 && !rule.options && !rule.query && !hasVueLoader)) {
          rule.loader = loaderString
        } else if (isWebpack2 && (rule.options || rule.query) && !hasVueLoader) {
          delete rule.loader
          rule.use = [
         'k12vux-loader',
            {
              loader: 'vue-loader',
              options: rule.options,
              query: rule.query
         }]
          delete rule.options
          delete rule.query
        } else if (isWebpack2 && hasVueLoader) {
          if (Array.isArray(rule.use)) {
            rule.use.unshift('k12vux-loader')
          } else if (typeof rule.use === 'object' && rule.use.loader === 'vue-loader') {
            let oldRule = rule.use
            rule.use = [
              'k12vux-loader',
              oldRule
            ]
          }
        }
        hasAppendVuxLoader = true
      }
    })
    if (!hasAppendVuxLoader) {
      config.module[loaderKey].push({
        test: /\.vue$/,
        loader: loaderString
      })
    }
  }

  /**
   * ======== append js-loader for ts-loader ========
   */
  config.module[loaderKey].forEach(function (rule) {
    if (rule.use && (rule.use[0] === 'ts-loader' || (typeof rule.use[0] === 'object' && rule.use[0].loader === 'ts-loader'))) {
      rule.use.push(jsLoader)
    } else {
      if (rule.loader === 'ts' || rule.loader === 'ts-loader' || (/\bts\b/.test(rule.loader) && !/!/.test(rule.loader))) {
        if (isWebpack2 && (rule.query || rule.options)) {
          let options
          if(rule.options){
            options = rule.options
            delete rule.options
          }else{
            options = rule.query
            delete rule.query
          }
          rule.use = [{
            loader: 'ts-loader',
            options: options
          }, jsLoader]
          delete rule.loader
        } else {
          rule.loader = 'ts-loader!' + jsLoader
        }
      }
    }
  })

  /**
   * ======== append js-loader ========
   */
  config.module[loaderKey].forEach(function (rule) {
    if (rule.use && (rule.use[0] === 'babel-loader' || (typeof rule.use[0] === 'object' && rule.use[0].loader === 'babel-loader'))) {
      rule.use.push(jsLoader)
    } else {
      if (rule.loader === 'babel' || rule.loader === 'babel-loader' || (/babel/.test(rule.loader) && !/!/.test(rule.loader))) {
        if (isWebpack2 && (rule.query || rule.options)) {
          let options
          if(rule.options){
            options = rule.options
            delete rule.options
          }else{
            options = rule.query
            delete rule.query
          }
          rule.use = [{
            loader: 'babel-loader',
            options: options
          }, jsLoader]
          delete rule.loader
        } else {
          rule.loader = 'babel-loader!' + jsLoader
        }
      }
    }
  })

  /**
   * ======== set compiling k12vux js source ========
   */
  if (hasPlugin('k12vux-ui', k12vuxConfig.plugins)) {
    if (typeof k12vuxConfig.options.k12vuxSetBabel === 'undefined' || k12vuxConfig.options.k12vuxSetBabel === true) {
      config.module[loaderKey].push(getBabelLoader(k12vuxConfig.options.projectRoot, 'k12vux', k12vuxConfig.options.k12vuxDev))
    }
  }

  // set done plugin
  if (hasPlugin('build-done-callback', k12vuxConfig.plugins)) {
    const callbacks = k12vuxConfig.plugins.filter(function (one) {
      return one.name === 'build-done-callback'
    }).map(function (one) {
      return one.fn
    })
    config.plugins.push(new DonePlugin(callbacks))
  }

  config.plugins.push(new DonePlugin([function () {
    if (global.reportInterval) {
      clearInterval(global.reportInterval)
      global.reportInterval = null
    }
  }]))

  // duplicate styles
  if (hasPlugin('duplicate-style', k12vuxConfig.plugins)) {
    let plugin = getFirstPlugin('duplicate-style', k12vuxConfig.plugins)
    let options = plugin.options || {}
    config.plugins.push(new DuplicateStyle(options))
  }

  if (hasPlugin('build-emit-callback', k12vuxConfig.plugins)) {
    config.plugins = config.plugins || []
    const callbacks = k12vuxConfig.plugins.filter(function (one) {
      return one.name === 'build-emit-callback'
    }).map(function (one) {
      return one.fn
    })
    if (callbacks.length) {
      config.plugins.push(new EmitPlugin(callbacks[0]))
    }
  }

  if (hasPlugin('html-build-callback', k12vuxConfig.plugins)) {
    let pluginConfig = getFirstPlugin('html-build-callback', k12vuxConfig.plugins)
    config.plugins.push(new htmlBuildCallbackPlugin(pluginConfig))
  }

   /**
   *======== global variable V_LOCALE ========
   */
  let locale = ''
  if (hasPlugin('i18n', k12vuxConfig.plugins)) {
    const config = getFirstPlugin('i18n', k12vuxConfig.plugins)
    if (config.k12vuxStaticReplace && config.k12vuxLocale) {
      locale = config.k12vuxLocale
    } else if (config.k12vuxStaticReplace === false) {
      locale = 'MULTI'
    }
  } else {
    locale = 'zh-CN'
  }

  /**
  *======== global variable V_SSR ========
  */
  let ssr = false
  if (k12vuxConfig.options.ssr) {
    ssr = true
  }

  // check if already defined V_LOCALE
  let matchLocale = config.plugins.filter(one => {
    if (one.constructor.name === 'DefinePlugin') {
      if (one.definitions && one.definitions.V_LOCALE) {
        return true
      }
    }
    return false
  })
  if (!matchLocale.length) {
    config.plugins.push(new webpack.DefinePlugin({
      V_LOCALE: JSON.stringify(locale),
      V_SSR: JSON.stringify(ssr),
      SUPPORT_SSR_TAG: JSON.stringify(true)
    }))
  }

  return config
}

const _addScriptLoader = function (content, SCRIPT) {
  // get script type
  if (/type=script/.test(content)) {
    // split loaders
    var loaders = content.split('!')
    loaders = loaders.map(function (item) {
      if (/type=script/.test(item)) {
        item = SCRIPT + '!' + item
      }
      return item
    }).join('!')
    content = loaders
  } else if (/require\("!!babel-loader/.test(content)) {
    content = content.replace('!!babel-loader!', `!!babel-loader!${SCRIPT}!`)
  } else if (/import\s__vue_script__\sfrom\s"!!babel\-loader!\.\/(.*?)"/.test(content)) {
    let loaders = content.split('!')
    loaders = loaders.map(function (item) {
      if (item === 'babel-loader') {
        item += '!' + SCRIPT
      }
      return item
    })
    content = loaders.join('!')
  }

  if (content.indexOf('export * from') !== -1) {
    let loaders = content.split('!')
    loaders = loaders.map(function (item) {
      if (item === 'babel-loader') {
        item += '!' + SCRIPT
      }
      return item
    })
    content = loaders.join('!')
  }
  return content
}

function addScriptLoader(source, SCRIPT) {
  var rs = source
  // escape \" first so the following regexp works fine
  rs = rs.replace(/\\"/g, '$VUX$')

  if (rs.indexOf('import __vue_script__ from') === -1) {
    rs = rs.replace(/require\("(.*)"\)/g, function (content) {
      return _addScriptLoader(content, SCRIPT)
    })
  } else {
    // for vue-loader@13
    rs = rs.replace(/import\s__vue_script__\sfrom\s"(.*?)"/g, function (content) {
      return _addScriptLoader(content, SCRIPT)
    })
  }

  if (rs.indexOf('export * from') !== -1) {
    rs = rs.replace(/export\s\*\sfrom\s"(.*?)"/g, function (content) {
      return _addScriptLoader(content, SCRIPT)
    })
  }

  // replace \" back
  rs = rs.replace(/\$VUX\$/g, '\\"')
  return rs
}

const _addTemplateLoader = function (content, TEMPLATE, BEFORE_TEMPLATE_COMPILER) {
  // get script type
  if (/type=template/.test(content)) {
    // split loaders
    var loaders = content.split('!')
    loaders = loaders.map(function (item) {
      if (/type=template/.test(item)) {
        item = TEMPLATE + '!' + item
      }
      if (item.indexOf('template-compiler/index') !== -1) {
        item = item + '!' + BEFORE_TEMPLATE_COMPILER
      }
      return item
    }).join('!')
    content = loaders
  }
  return content
}

function addTemplateLoader(source, TEMPLATE, BEFORE_TEMPLATE_COMPILER) {
  source = source.replace(/\\"/g, '__VUX__')
  var rs = source
  let doParse = false

  if (rs.indexOf('import {render as __vue_render__, staticRenderFns as __vue_static_render_fns__} from') !== -1) {
    // for vue-loader@14
    rs = rs.replace(/import\s{render\sas\s__vue_render__,\sstaticRenderFns\sas\s__vue_static_render_fns__}\sfrom\s"(.*?)"/g, function (content) {
      return _addTemplateLoader(content, TEMPLATE, BEFORE_TEMPLATE_COMPILER)
    })
    doParse = true
  }

  if (!doParse && rs.indexOf('import __vue_template__ from') !== -1) {
    // for vue-loader@13
    rs = rs.replace(/import\s__vue_template__\sfrom\s"(.*?)"/g, function (content) {
      return _addTemplateLoader(content, TEMPLATE, BEFORE_TEMPLATE_COMPILER)
    })
    doParse = true
  }

  if (!doParse && rs.indexOf('import __vue_template__ from') === -1) {
    rs = rs.replace(/require\("(.*)"\)/g, function (content) {
      return _addTemplateLoader(content, TEMPLATE, BEFORE_TEMPLATE_COMPILER)
    })
  }

  rs = rs.replace(/__VUX__/g, '\\"')
  return rs
}

function addStyleLoader(source, STYLE, variables, AFTER_LESS_STYLE) {
  let rs = source.replace(/require\("(.*)"\)/g, function (content) {
    if (/type=style/.test(content)) {
      var loaders = content.split('!')
      loaders = loaders.map(function (item) {
        if (/type=style/.test(item)) {
          item = STYLE + '!' + item
        }
        if (/less-loader/.test(item)) {
          if (variables) {
            var params = {
              modifyVars: variables
            }
            if (/sourceMap/.test(item)) {
              params.sourceMap = true
            }
            params = JSON.stringify(params).replace(/"/g, "'")
            item = item.split('?')[0] + '?' + params
          }

          item = AFTER_LESS_STYLE + '!' + item
        }
        return item
      }).join('!')

      content = loaders
    }
    return content
  })
  return rs
}

/**
 * use babel so component's js can be compiled
 */
function getBabelLoader(projectRoot, name, isDev) {
  name = name || 'k12vux'
  if (!projectRoot) {
    projectRoot = path.resolve(__dirname, '../../../')
    if (/\.npm/.test(projectRoot)) {
      projectRoot = path.resolve(projectRoot, '../../../')
    }
  }

  let componentPath
  let regex
  if (!isDev) {
    componentPath = fs.realpathSync(projectRoot + `/node_modules/${name}/`) // https://github.com/webpack/webpack/issues/1643
    regex = new RegExp(`node_modules.*${name}.src.*?js$`)
  } else {
    componentPath = projectRoot
    regex = new RegExp(`${projectRoot}.src.*?js$`)
  }

  return {
    test: regex,
    loader: 'babel-loader',
    include: componentPath
  }
}

function setWebpackConfig(oriConfig, appendConfig, isWebpack2) {
  if (isWebpack2) {
    oriConfig.plugins.push(new webpack.LoaderOptionsPlugin(appendConfig))
  } else {
    oriConfig = merge(oriConfig, appendConfig)
  }
  return oriConfig
}

function getOnePlugin(name, plugins) {
  const matches = plugins.filter(function (one) {
    return one.name === name
  })
  return matches.length ? matches[0] : null
}
