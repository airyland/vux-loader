'use strict'

module.exports = function (source, name, cb) {
  const reg = new RegExp(`<${name}([\\s\\S]*?)>.*?</${name}>`, 'g')
  source = source.replace(reg, function (a, b) {
    let query = getAttributes(a)
    return cb(query, a)
  })
  return source
}

function getAttributes (string) {
  let match = string.match(/\s+(.*?)="(.*?)"/g)

  let obj = {}
  let list = match.map(one => {
    return one.replace(/^\s+|\s+$/g, '').replace(/\.native/g, '')
  })

  for (let i = 0; i < list.length; i++) {
    const pair = list[i].split('=').map(one => {
      return one.replace(/"/g, '')
    })
    if (pair.length === 2) {
      obj[pair[0]] = pair[1]
    } else if (pair.length > 2) {
      obj[pair[0]] = pair.slice(1).join('=')
    }
    
  }
  return {
    stringList: list.join(' '),
    arrayList: list,
    objectList: obj
  }
}