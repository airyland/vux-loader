'use strict'

const path = require('path')
const fs = require('fs')
const merge = require('webpack-merge')
const utils = require('loader-utils')
const less = require('less')
const yaml = require('js-yaml')

var webpack = require('webpack')

const scriptLoader = path.join(__dirname, './script-loader.js')
const styleLoader = path.join(__dirname, './style-loader.js')
const templateLoader = path.join(__dirname, './template-loader.js')

const projectRoot = path.resolve(__dirname, '../../../')

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
  const TEMPLATE = utils.stringifyRequest(this, templateLoader).replace(/"/g, '')

  var query = utils.parseQuery(this.query)
  this.cacheable()
  if (!source) return source
  const config = utils.getLoaderConfig(this, "vux")
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
  source = addStyleLoader(source, STYLE, variables)
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

  let canLog = true
  if (vuxConfig.options.isTest) {
    canLog = false
  }

  if (canLog) {
    console.log('\n======================== vux-loader ========================')
    console.log('Bug Reports: https://github.com/airyland/vux-loader/issues')
    console.log('============================================================\n')
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

  let loaderKey = isWebpack2 ? 'rules' : 'loaders'

  /**
   * ======== set vux options ========
   */
  // for webpack@2.x, options should be provided with LoaderOptionsPlugin
  if (isWebpack2) {
    if (!config.plugins) {
      config.plugins = []
    }
    config.plugins.push(new webpack.LoaderOptionsPlugin({
      options: {
        vux: vuxConfig
      }
    }))
  } else { // for webpack@1.x, merge directly

    config = merge(config, {
      vux: vuxConfig
    })

  }

  /**
   * ======== read vux locales and set globally ========
   */
  if (hasPlugin('vux-ui', vuxConfig.plugins)) {
    const vuxLocalesPath = path.resolve(vuxConfig.options.projectRoot, 'node_modules/vux/src/locales/all.yml')

    try {
      const vuxLocalesContent = fs.readFileSync(vuxLocalesPath, 'utf-8')
      let vuxLocalesJson = yaml.safeLoad(vuxLocalesContent)

      const globalConfigLocalesPath = path.resolve(vuxConfig.options.projectRoot, 'src/global_locales.yml')
      const globalConfigLocalesContent = fs.readFileSync(globalConfigLocalesPath, 'utf-8')
      const globalConfigLocalesJson = yaml.safeLoad(globalConfigLocalesContent)

      vuxLocalesJson = Object.assign(vuxLocalesJson, globalConfigLocalesJson)
      if (isWebpack2) {
        config.plugins.push(new webpack.LoaderOptionsPlugin({
          vuxLocales: vuxLocalesJson
        }))
      } else {
        config = merge(config, {
          vuxLocales: vuxLocalesJson
        })
      }
    } catch (e) {
    }
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
        rule.loader = loaderString
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
   * ======== set compiling vux js source ========
   */
  if (vuxConfig.options.vuxImportParser) {
    config.module[loaderKey].push(getBabelLoader())
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
    config.plugins.push(new DuplicateStyle())
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
          item = item + '!' + SCRIPT
        }
        return item
      }).join('!')
      content = loaders
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

function addStyleLoader(source, STYLE, variables) {
  let rs = source.replace(/require\("(.*)"\)/g, function (content) {
    if (/type=style/.test(content)) {
      var loaders = content.split('!')
      loaders = loaders.map(function (item) {
        if (/type=style/.test(item)) {
          item = STYLE + '!' + item
        }
        if (/less-loader/.test(item) && variables) {
          var params = {
            modifyVars: variables
          }
          if (/sourceMap/.test(item)) {
            params.sourceMap = true
          }
          params = JSON.stringify(params).replace(/"/g, "'")
          item = item.split('?')[0] + '?' + params
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
    loader: 'babel',
    include: componentPath
  }
}

/**
 * @todo cache theme content?
 * @todo support array of themes
 */
function getLessVariables(theme) {
  var themeContent = fs.readFileSync(theme, 'utf-8')
  var variables = {}
  themeContent.split('\n').forEach(function (item) {
    var _pair = item.split(':')
    if (_pair.length < 2) return;
    var key = _pair[0].replace('\r', '').replace('@', '')
    if (!key) return;
    var value = _pair[1].replace(';', '').replace('\r', '').replace(/^\s+|\s+$/g, '')
    variables[key] = value
  })
  return variables
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