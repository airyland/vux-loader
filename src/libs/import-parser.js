'use strict'

function parse(source, fn, moduleName) {
  if ((moduleName && source.indexOf(moduleName) === -1) || source.indexOf('import') === -1) {
    return source
  }
  let moduleString = moduleName || '.*'
  const reg = new RegExp(`import.*{(.*)}.*from '(${moduleString})'`, 'g')

  source = source.replace(reg, function (match1, match2, match3) {
    // console.log('match is', match, match2, match3)
    const components = match1.split('{')[1].split('}')[0].split(',').map(function (one) {
        return one.replace(/^\s+|\s+$/g, '')
      }).map(function (one) {
        if (!/\s+/.test(one)) {
          return {
            originalName: one,
            newName: one,
            moduleName: match3
          }
        } else {
          let _list = one.split('as').map(function (one) {
            return one.replace(/^\s+|\s+$/g, '')
          })
          return {
            originalName: _list[0],
            newName: _list[1],
            moduleName: match3
          }
        }
      })
      // console.log('final components', components)
    if (fn) {
      return fn({
        components: components,
        match1: match1,
        match2: match2,
        match3: match3,
        source: source
      })
    } else {
      return match1
    }
  })
  return source
}
/**
parse(`import {a,b} from 'vux'`)
parse(`import { a,b} from 'vux'`)
parse(`import {  a,b} from 'vux'`)
parse(`import {  a, b} from 'vux'`)
parse(`import {  a, b } from 'vux'`)
parse(`import {  a, b as c } from 'vux'`)
parse(`import {  a, b as  c } from 'vux'`)
parse(`import {  a,  b  as  c } from 'vux'`)
parse(`import {a,b} from 'vux1' 
  import {  a as AA,  b  as  BB } from 'vux2'`)

parse(`import {AlertPlugin, ToastPlugin} from 'vux'`, function (opts) {
  let str = ''
  opts.components.forEach(function (one) {
    if (one.originalName === 'AlertPlugin') {
      str += `import ${one.newName} from 'vux/src/plugins/Alert'\n`
    } else if (one.originalName === 'ToastPlugin') {
      str += `import ${one.newName} from 'vux/src/plugins/Toast'\n`
    }
  })
  return str
})
**/
module.exports = parse
