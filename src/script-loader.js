'use strict'

const utils = require('loader-utils')

module.exports = function (source) {
  this.cacheable()
  const config = utils.getLoaderConfig(this, "vux")
  if (!config.plugins || !config.plugins.length) {
    return source
  }

  config.plugins.forEach(function (plugin) {
    // script-parser
    if (plugin.name === 'script-parser') {
      if (plugin.fn) {
        source = plugin.fn.call(plugin.fn, source)
      }
    }
  })

  let matchVuxUi = config.plugins.filter(function(one){
    return one.name === 'vux-ui'
  })
  if (matchVuxUi.length) {
    source = importParser(source, config)
  }

  return source
}

// @todo 解析 as 
function importParser(source, config) {
  if (!/import \{/.test(source) && !/vux/) {
    return source
  }

  source = source.replace(/import.*{(.*)}.*from 'vux'/g, function (match) {
    if (!match) return match
    const components = match.split('{')[1].split('}')[0].split(',').map(function (one) {
      return one.replace(/\s+/g, '')
    })
    let str = ''
    str = components.map(function (item) {
      if(item === 'ChinaAddressData') {
        return `import ChinaAddressData from 'vux/src/datas/china_address.json'`
      } else if (/Item/.test(item)) {
        return ''
      } else {
        const name = item.replace(/([A-Z])/g, function ($1) {
          return "-" + $1.toLowerCase();
        }).slice(1)
        if (components.indexOf(item + 'Item') > 0) { // 子组件一起引入
          return `import { ${item}, ${item}Item } from 'vux/src/components/${name}'`
        } else if(item === 'Swiper' && components.indexOf('SwiperItem') === -1){ // 单个引入 Swiper
          return `import Swiper from 'vux/src/components/swiper/swiper.vue'`
        } else if(item === 'SwiperItem' && components.indexOf('Swiper') === -1){ // 单个引入 SwiperItem
          return `import SwiperItem from 'vux/src/components/swiper/swiper-item.vue'`
        }else{
          return `import ${item} from 'vux/src/components/${name}'`
        }
      }
    }).join('\n')
    return str
  })

  return source
}