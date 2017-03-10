'use strict'

const path = require('path')
const fs = require('fs')
const merge = require('webpack-merge')
const utils = require('loader-utils')
const less = require('less')
const yaml = require('js-yaml')
const _ = require('lodash')

var webpack = require('webpack')

const scriptLoader = path.join(__dirname, './script-loader.js')
const styleLoader = path.join(__dirname, './style-loader.js')
const templateLoader = path.join(__dirname, './template-loader.js')
const jsLoader = path.join(__dirname, './js-loader.js')
const afterLessLoader = path.join(__dirname, './after-less-loader.js')

require('./libs/report')

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

  var query = utils.parseQuery(this.query)
  this.cacheable()
  if (!source) return source
  const config = this.vux || utils.getLoaderConfig(this, 'vux')
  if (!config) {
    return source
  }

  let variables = ''
  var themes = config.plugins.filter(function (plugin) {
    return plugin.name === 'less-theme'
  })

  if (themes.length) {
    const themePath = path.join(projectRoot, themes[0].path)
    this.addDependency(themePath)
    variables = getLessVariables(themes[0].path)
  }

  source = addScriptLoader(source, SCRIPT)
  source = addStyleLoader(source, STYLE, variables, AFTER_LESS_STYLE)
  source = addTemplateLoader(source, TEMPLATE)

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

// merge vux options and return new webpack config
module.exports.merge = function (oldConfig, vuxConfig) {
  oldConfig = Object.assign({
    plugins: []
  }, oldConfig)

  let config = Object.assign({
    module: {},
    plugins: []
  }, oldConfig)

  if (!vuxConfig) {
    vuxConfig = {
      options: {},
      plugins: []
    }
  }

  if (!vuxConfig.options) {
    vuxConfig.options = {}
  }

  if (!vuxConfig.plugins) {
    vuxConfig.plugins = []
  }

  vuxConfig.allPlugins = vuxConfig.allPlugins || []

  // check multi plugin instance
  const pluginGroup = _.groupBy(vuxConfig.plugins, function (plugin) {
    return plugin.name
  })
  for (let group in pluginGroup) {
    if (pluginGroup[group].length > 1) {
      throw (`only one instance is allowed. plugin name: ${group}`)
    }
  }

  // if exists old vux config, merge options and plugins list
  let oldVuxConfig = oldConfig.vux || null

  oldConfig.plugins.forEach(function (plugin) {
    if (plugin.constructor.name === 'LoaderOptionsPlugin' && plugin.options.vux) {
      oldVuxConfig = plugin.options.vux
    }
  })

  if (oldVuxConfig) {
    // merge old options
    vuxConfig.options = Object.assign(oldVuxConfig.options, vuxConfig.options)
      // merge old plugins list
    vuxConfig.plugins.forEach(function (newPlugin) {
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
    vuxConfig.allPlugins = oldVuxConfig.allPlugins
  } else {
    vuxConfig.allPlugins = vuxConfig.plugins
  }

  // filter plugins by env
  if (vuxConfig.options.env && vuxConfig.allPlugins.length) {
    vuxConfig.plugins = vuxConfig.allPlugins.filter(function (plugin) {
      return typeof plugin.envs === 'undefined' || (typeof plugin.envs === 'object' && plugin.envs.length && plugin.envs.indexOf(vuxConfig.options.env) > -1)
    })
  }

  if (!vuxConfig.options.projectRoot) {
    vuxConfig.options.projectRoot = projectRoot
  }

  // check webpack version by module.loaders
  let isWebpack2

  if (typeof vuxConfig.options.isWebpack2 !== 'undefined') {
    isWebpack2 = vuxConfig.options.isWebpack2
  } else if (oldConfig.module && oldConfig.module.rules) {
    isWebpack2 = true
  } else if (oldConfig.module && oldConfig.module.loaders) {
    isWebpack2 = false
  }

  if (typeof isWebpack2 === 'undefined') {
    const compareVersions = require('compare-versions')
    const pkg = require(path.resolve(projectRoot, 'package.json'))
    isWebpack2 = compareVersions(pkg.devDependencies.webpack.replace('^', '').replace('~', ''), '2.0.0') > -1
  }

  if (!isWebpack2) {
    if (!config.vue) {
      config.vue = {
        loaders: {
          i18n: 'vux-loader/src/noop-loader.js'
        }
      }
    } else {
      if (!config.vue.loaders) {
        config.vue.loaders = {}
      }
      config.vue.loaders.i18n = 'vux-loader/src/noop-loader.js'
    }
  }

  let loaderKey = isWebpack2 ? 'rules' : 'loaders'

  config.module[loaderKey] = config.module[loaderKey] || []

  const useVuxUI = hasPlugin('vux-ui', vuxConfig.plugins)
  vuxConfig.options.useVuxUI = true

  /**
   * ======== set vux options ========
   */
  // for webpack@2.x, options should be provided with LoaderOptionsPlugin
  if (isWebpack2) {
    if (!config.plugins) {
      config.plugins = []
    }
    // delete old config for webpack2
    config.plugins.forEach(function (plugin, index) {
      if (plugin.constructor.name === 'LoaderOptionsPlugin' && plugin.options.vux) {
        config.plugins.splice(index, 1)
      }
    })
    config.plugins.push(new webpack.LoaderOptionsPlugin({
      vux: vuxConfig
    }))
  } else { // for webpack@1.x, merge directly

    config = merge(config, {
      vux: vuxConfig
    })

  }

  if (hasPlugin('inline-manifest', vuxConfig.plugins)) {
    var InlineManifestWebpackPlugin = require('inline-manifest-webpack-plugin')
    config.plugins.push(new InlineManifestWebpackPlugin({
      name: 'webpackManifest'
    }))
  }

  if (hasPlugin('vux-ui', vuxConfig.plugins)) {
    let mapPath = path.resolve(vuxConfig.options.projectRoot, 'node_modules/vux/src/components/map.json')
    if (vuxConfig.options.vuxDev) {
      mapPath = path.resolve(vuxConfig.options.projectRoot, 'src/components/map.json')
    }
    const maps = require(mapPath)
    if (isWebpack2) {
      config.plugins.push(new webpack.LoaderOptionsPlugin({
        vuxMaps: maps
      }))
    } else {
      config = merge(config, {
        vuxMaps: maps
      })
    }
  }

  /**
   * ======== read vux locales and set globally ========
   */
  if (hasPlugin('vux-ui', vuxConfig.plugins)) {
    let vuxLocalesPath = path.resolve(vuxConfig.options.projectRoot, 'node_modules/vux/src/locales/all.yml')
    if (vuxConfig.options.vuxDev) {
      vuxLocalesPath = path.resolve(vuxConfig.options.projectRoot, 'src/locales/all.yml')
    }
    try {
      const vuxLocalesContent = fs.readFileSync(vuxLocalesPath, 'utf-8')
      let vuxLocalesJson = yaml.safeLoad(vuxLocalesContent)

      if (isWebpack2) {
        config.plugins.push(new webpack.LoaderOptionsPlugin({
          vuxLocales: vuxLocalesJson
        }))
      } else {
        config = merge(config, {
          vuxLocales: vuxLocalesJson
        })
      }
    } catch (e) {}
  }

  /**
   * ======== append vux-loader ========
   */
  let loaderString = vuxConfig.options.loaderString || 'vux-loader!vue-loader'
  const rewriteConfig = vuxConfig.options.rewriteLoaderString
  if (typeof rewriteConfig === 'undefined' || rewriteConfig === true) {
    let hasAppendVuxLoader = false
    config.module[loaderKey].forEach(function (rule) {
      if (rule.loader === 'vue' || rule.loader === 'vue-loader') {
        if (!isWebpack2 || (isWebpack2 && !rule.options && !rule.query)) {
          rule.loader = loaderString
        } else if (isWebpack2 && (rule.options || rule.query)) {
          delete rule.loader
          rule.use = [
         'vux-loader',
            {
              loader: 'vue-loader',
              options: rule.options,
              query: rule.query
         }]
          delete rule.options
          delete rule.query
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
   * ======== append js-loader ========
   */
  config.module[loaderKey].forEach(function (rule) {
    if (rule.loader === 'babel' || rule.loader === 'babel-loader' || (/babel/.test(rule.loader) && !/!/.test(rule.loader))) {
      if (isWebpack2 && rule.query) {
        rule.use = [jsLoader, {
          loader: 'babel-loader',
          query: rule.query
        }]
        delete rule.query
        delete rule.loader
      } else {
        rule.loader = 'babel-loader!' + jsLoader
      }
    }
  })

  /**
   * ======== set compiling vux js source ========
   */
  if (hasPlugin('vux-ui', vuxConfig.plugins)) {
    if (typeof vuxConfig.options.vuxSetBabel === 'undefined' || vuxConfig.options.vuxSetBabel === true) {
      config.module[loaderKey].push(getBabelLoader())
    }
  }

  // set done plugin
  if (hasPlugin('build-done-callback', vuxConfig.plugins)) {
    const callbacks = vuxConfig.plugins.filter(function (one) {
      return one.name === 'build-done-callback'
    }).map(function (one) {
      return one.fn
    })
    config.plugins.push(new DonePlugin(callbacks))
  }

  // duplicate styles
  if (hasPlugin('duplicate-style', vuxConfig.plugins)) {
    let plugin = getFirstPlugin('duplicate-style', vuxConfig.plugins)
    let options = plugin.options || {}
    config.plugins.push(new DuplicateStyle(options))
  }

  if (hasPlugin('build-emit-callback', vuxConfig.plugins)) {
    config.plugins = config.plugins || []
    const callbacks = vuxConfig.plugins.filter(function (one) {
      return one.name === 'build-emit-callback'
    }).map(function (one) {
      return one.fn
    })
    if (callbacks.length) {
      config.plugins.push(new EmitPlugin(callbacks[0]))
    }
  }

  if (hasPlugin('html-build-callback', vuxConfig.plugins)) {
    let pluginConfig = getFirstPlugin('html-build-callback', vuxConfig.plugins)
    config.plugins.push(new htmlBuildCallbackPlugin(pluginConfig))
  }

  return config
}

function addScriptLoader(source, SCRIPT) {
  var rs = source.replace(/require\("(.*)"\)/g, function (content) {
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
    }
    return content
  })
  return rs
}

function addTemplateLoader(source, TEMPLATE) {
  var rs = source.replace(/require\("(.*)"\)/g, function (content) {
    // get script type
    if (/type=template/.test(content)) {
      // split loaders
      var loaders = content.split('!')
      loaders = loaders.map(function (item) {
        if (/type=template/.test(item)) {
          item = TEMPLATE + '!' + item
        }
        return item
      }).join('!')
      content = loaders
    }
    return content
  })
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
function getBabelLoader(projectRoot, name) {
  name = name || 'vux'
  if (!projectRoot) {
    projectRoot = path.resolve(__dirname, '../../../')
    if (/\.npm/.test(projectRoot)) {
      projectRoot = path.resolve(projectRoot, '../../../')
    }
  }

  const componentPath = fs.realpathSync(projectRoot + `/node_modules/${name}/`) // https://github.com/webpack/webpack/issues/1643
  const regex = new RegExp(`node_modules.*${name}.src.*?js$`)

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