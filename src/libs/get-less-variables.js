'use strict'
const fs = require('fs')
module.exports = function getLessVariables(theme) {
  var themeContent = fs.readFileSync(theme, 'utf-8')
  var variables = {}
  themeContent.split('\n').forEach(function (item) {
    if (trim(item).indexOf('//') === 0 || trim(item).indexOf('/*') === 0) {
      return
    }

    // has comments
    if (item.indexOf('//') > 0) {
      item = trim(item.slice(0, item.indexOf('//')))
    }
    if (item.indexOf('/*') > 0) {
      item = trim(item.slice(0, item.indexOf('/*')))
    }
    var _pair = item.split(':')
    if (_pair.length < 2) return;
    var key = _pair[0].replace('\r', '').replace('@', '')
    if (!key) return;
    var value = _pair[1].replace(';', '').replace('\r', '').replace(/^\s+|\s+$/g, '')
    variables[key] = value
  })
  return variables
}


function trim (str) {
  if (!str) {
    return ''
  } else {
    return str.replace(/^\s+|\s+$/g, '')
  }
}
