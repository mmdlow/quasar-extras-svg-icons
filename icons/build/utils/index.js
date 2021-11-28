const xmldom = require('@xmldom/xmldom')
const Parser = new xmldom.DOMParser()
const { optimize } = require('svgo')
let { defaultPlugins } = require('svgo/lib/svgo/config')

// remove the 'removeViewBox' plugin, as we need 'viewBox' to not be removed
defaultPlugins = defaultPlugins.filter(name => name !== 'removeViewBox' && name !== 'convertPathData')

const { resolve, basename } = require('path')
const { readFileSync, writeFileSync } = require('fs')

const typeExceptions = [ 'g', 'svg', 'defs', 'style', 'title', 'clipPath', 'desc', 'mask', 'linearGradient', 'radialGradient', 'stop' ]
const noChildren = ['clipPath']

function chunkArray (arr, size = 2) {
  const results = []
  while (arr.length) {
    results.push(arr.splice(0, size))
  }
  return results
}

function calcValue (val, base) {
  return /%$/.test(val) ? (val.replace('%', '') * 100) / base : +val
}

function getAttributes (el, list) {
  const att = {}

  list.forEach(name => {
    att[ name ] = parseFloat(el.getAttribute(name))
  })

  return att
}

function getCurvePath (x, y, rx, ry) {
  return `A${ rx },${ ry },0,0,1,${ x },${ y }`
}

const decoders = {
  svg (el) {

  },

  path (el) {
    const points = el.getAttribute('d')
    return (points.charAt(0) === 'm' ? 'M0 0z' : '') + points
  },

  circle (el) {
    const att = getAttributes(el, [ 'cx', 'cy', 'r' ])
    return `M${ att.cx } ${ att.cy } m-${ att.r }, 0 a${ att.r },${ att.r } 0 1,0 ${ att.r * 2 },0 a${ att.r },${ att.r } 0 1,0 ${ att.r * -2 },0`
  },

  ellipse (el) {
    const att = getAttributes(el, [ 'cx', 'cy', 'rx', 'ry' ])
    return 'M' + (att.cx - att.rx) + ',' + att.cy
      + 'a' + att.rx + ',' + att.ry + ' 0 1,0 ' + (2 * att.rx) + ',0'
      + 'a' + att.rx + ',' + att.ry + ' 0 1,0' + (-2 * att.rx) + ',0Z'
  },

  polygon (el) {
    return this.polyline(el) + 'z'
  },

  polyline (el) {
    const points = el.getAttribute('points')
    const pointsArray = points
      .replace(/  /g, ' ')
      .trim()
      .split(/\s+|,/)
      .reduce((arr, point) => {
        return [ ...arr, ...(point.includes(',') ? point.split(',') : [point]) ]
      }, [])

    const pairs = chunkArray(pointsArray, 2)
    return pairs.map(([ x, y ], i) => {
      return `${ i === 0 ? 'M' : 'L' }${ x } ${ y }`
    }).join(' ')
  },

  rect (el) {
    const att = getAttributes(el, [ 'x', 'y', 'width', 'height', 'rx', 'ry' ])
    const w = +att.width
    const h = +att.height
    const x = att.x ? +att.x : 0
    const y = att.y ? +att.y : 0
    let rx = att.rx || 'auto'
    let ry = att.ry || 'auto'
    if (rx === 'auto' && ry === 'auto') {
      rx = ry = 0
    }
    else if (rx !== 'auto' && ry === 'auto') {
      rx = ry = calcValue(rx, w)
    }
    else if (ry !== 'auto' && rx === 'auto') {
      ry = rx = calcValue(ry, h)
    }
    else {
      rx = calcValue(rx, w)
      ry = calcValue(ry, h)
    }
    if (rx > w / 2) {
      rx = w / 2
    }
    if (ry > h / 2) {
      ry = h / 2
    }
    const hasCurves = rx > 0 && ry > 0
    return [
      `M${ x + rx } ${ y }`,
      `H${ x + w - rx }`,
      ...(hasCurves ? [`A${ rx } ${ ry } 0 0 1 ${ x + w } ${ y + ry }`] : []),
      `V${ y + h - ry }`,
      ...(hasCurves ? [`A${ rx } ${ ry } 0 0 1 ${ x + w - rx } ${ y + h }`] : []),
      `H${ x + rx }`,
      ...(hasCurves ? [`A${ rx } ${ ry } 0 0 1 ${ x } ${ y + h - ry }`] : []),
      `V${ y + ry }`,
      ...(hasCurves ? [`A${ rx } ${ ry } 0 0 1 ${ x + rx } ${ y }`] : []),
      'z',
    ].join(' ')
  },

  line (el) {
    const att = getAttributes(el, [ 'x1', 'x2', 'y1', 'y2' ])
    return 'M' + att.x1 + ',' + att.y1 + 'L' + att.x2 + ',' + att.y2
  }
}

function getAttributesAsStyle (el) {
  const exceptions = [ 'd', 'style', 'width', 'height', 'rx', 'ry', 'r', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'points', 'class', 'xmlns', 'viewBox', 'id', 'name', 'transform', 'data-name', 'aria-hidden', 'clip-path' ]
  let styleString = ''
  for (let i = 0; i < el.attributes.length; ++i) {
    const attr = el.attributes[ i ]
    if (exceptions.includes(attr.nodeName) !== true) {
      // if (attr.nodeName === 'fill' && attr.nodeValue === 'currentColor') continue
      styleString += `${ attr.nodeName }:${ attr.nodeValue };`
    }
  }
  return styleString
}

function parseDom (name, el, pathsDefinitions, attributes, options) {
  const type = el.nodeName

  if (
    el.getAttribute === void 0
    || el.getAttribute('opacity') === '0'
  ) {
    return
  }

  if (typeExceptions.includes(type) === false) {
    if (decoders[ type ] === void 0) {
      // throw new Error(`Encountered unknown tag type: "${type}"`)
      console.error(`Encountered unknown tag type: "${ type }" in ${ name }`)
      return
    }

    // don't allow for multiples of same
    let strAttributes = (attributes + (el.getAttribute('style') || getAttributesAsStyle(el)))
    
    // any styles filters?
    if (options?.stylesFilter && options.stylesFilter.length > 0) {
      options.stylesFilter.forEach(filter => {
        strAttributes = strAttributes.replace(filter.from, filter.to)
      })
    }

    const arrAttributes = strAttributes.split(';')
    const combinedStyles = new Set(arrAttributes)

    const paths = {
      path: decoders[ type ](el),
      style: Array.from(combinedStyles).join(';'),
      transform: el.getAttribute('transform')
    }

    if (paths.path.length > 0) {
      pathsDefinitions.push(paths)
    }
  }
  else if (type === 'g') {
    attributes += el.getAttribute('style') || getAttributesAsStyle(el)
  }

  if (noChildren.includes(type) === false) {
    Array.from(el.childNodes).forEach(child => {
      parseDom(name, child, pathsDefinitions, attributes, options)
    })
  }
}

function parseSvgContent (name, content, options) {
  const dom = Parser.parseFromString(content, 'text/xml')

  const viewBox = dom.documentElement.getAttribute('viewBox')
  const pathsDefinitions = []

  // const strokeWidth = dom.documentElement.getAttribute('stroke-width')
  // const stroke = dom.documentElement.getAttribute('stroke')
  // const fill = dom.documentElement.getAttribute('fill')
  // const strokeLinecap = dom.documentElement.getAttribute('stroke-line-cap')
  // const strokeLinejoin = dom.documentElement.getAttribute('stroke-linejoin')

  const attributes = getAttributesAsStyle(dom.documentElement)

  try {
    parseDom(name, dom.documentElement, pathsDefinitions, attributes, options)
  }
  catch (err) {
    console.error(`[Error] "${ name }" could not be parsed:`)
    throw err
  }

  if (pathsDefinitions.length === 0) {
    throw new Error(`Could not infer any paths for "${ name }"`)
  }

  const tmpView = `|${ viewBox }`

  const result = {
    viewBox: viewBox !== '0 0 24 24' && tmpView !== '|' ? tmpView : ''
  }

  if (pathsDefinitions.every(def => !def.style && !def.transform)) {
    result.paths = pathsDefinitions
      .map(def => def.path)
      .join('')
  }
  else {
    result.paths = pathsDefinitions
      .map(def => {
        return def.path
          // (def.style ? `@@${def.style.replace(/#[0-9a-fA-F]{3,6}/g, 'currentColor')}` : (def.transform ? '@@' : '')) +
          + (def.style ? `@@${ def.style }` : (def.transform ? '@@' : ''))
          + (def.transform ? `@@${ def.transform }` : '')
      })
      .join('&&')
  }

  return result
}

function getBanner (iconSetName, versionOrPackageName) {
  const version
    = versionOrPackageName === '' || versionOrPackageName.match(/^\d/)
      ? versionOrPackageName === '' ? versionOrPackageName : 'v' + versionOrPackageName
      : 'v' + require(resolve(__dirname, `../../../node_modules/${ versionOrPackageName }/package.json`)).version

  return `/* ${ iconSetName } ${ version } */\n\n`
}

module.exports.defaultNameMapper = (filePath, prefix, options) => {
  let baseName = basename(filePath, '.svg')

  if (baseName.endsWith(' ')) {
    console.log(baseName + ' ends with space')
    baseName = baseName.trim()
  }

  if (options?.filterName && typeof options.filterName === 'function') {
    baseName = options.filterName(baseName)
  }

  let name = ((prefix ? prefix + '-' : '') + baseName).replace(/_|%|\+/g, '-').replace(/\s|-{2,}/g, '-').replace(/(-\w)/g, m => m[ 1 ].toUpperCase())
  if (name.charAt(name.length - 1) === '-' || name.charAt(name.length - 1) === ' ') {
    name = name.slice(0, name.length - 1)
  }
  return name
}

function extractSvg (content, name, options = {}) {
  // any svg preFilters?
  if (options?.preFilters && options.preFilters.length > 0) {
    options.preFilters.forEach(filter => {
      content = content.replace(filter.from, filter.to)
    })
  }

  // any excluded icons from SVGO?
  let isExcluded = false
  if (options?.excluded && options.excluded.length > 0) {
    isExcluded = options.excluded.includes(name)
  }

  let result
  if (!isExcluded) {
    const { data } = optimize(content, {
      plugins: defaultPlugins
    })
    result = data
  }


  const optimizedSvgString = result || content
  const { paths, viewBox } = parseSvgContent(name, optimizedSvgString, options)
  let paths2 = paths
  // any svg postFilters?
  if (options?.postFilters && options.postFilters.length > 0) {
    options.postFilters.forEach(filter => {
      paths2 = paths2.replace(filter.from, filter.to)
    })
  }
  
  const path = paths2
    .replace(/[\r\n\t]+/gi, ',')
    .replace(/,,/gi, ',')
    .replace(/fill:none;fill:currentColor;/g, 'fill:currentColor;')

  return {
    svgDef: `export const ${ name } = '${ path }${ viewBox }'`,
    typeDef: `export declare const ${ name }: string;`
  }
}

module.exports.extractSvg = extractSvg

module.exports.extract = (filePath, name, options) => {
  const content = readFileSync(filePath, 'utf-8')

  return extractSvg(content, name, options)
}

module.exports.writeExports = (iconSetName, versionOrPackageName, distFolder, svgExports, typeExports, skipped) => {
  if (svgExports.length === 0) {
    console.log(`WARNING. ${ iconSetName } skipped completely`)
  }
  else {
    const banner = getBanner(iconSetName, versionOrPackageName);
    const distIndex = `${ distFolder }/index`

    writeFileSync(`${ distIndex }.js`, banner + svgExports.join('\n'), 'utf-8')
    writeFileSync(`${ distIndex }.d.ts`, banner + typeExports.join('\n'), 'utf-8')

    if (skipped.length > 0) {
      console.log(`${ iconSetName } - skipped (${ skipped.length }): ${ skipped }`)
    }
  }
}

const sleep = (delay = 0) => {
  return new Promise((resolve) => {
    setTimeout(resolve, delay)
  })
}

module.exports.sleep = sleep

const waitUntil = async (test, options = {}) => {
  const { delay = 5e3, tries = -1 } = options
  const { predicate, result } = await test()

  if (predicate) {
    return result
  }

  if (tries - 1 === 0) {
    throw new Error('tries limit reached')
  }

  await sleep(delay)
  return waitUntil(test, { ...options, tries: tries > 0 ? tries - 1 : tries })
}

module.exports.waitUntil = waitUntil

const retry = async (tryFunction, options = {}) => {
  const { retries = 3 } = options

  let tries = 0
  let output = null
  let exitErr = null

  const bail = (err) => {
    exitErr = err
  }

  while (tries < retries) {
    tries += 1
    try {
      // eslint-disable-next-line no-await-in-loop
      output = await tryFunction({ tries, bail })
      break
    }
    catch (err) {
      if (tries >= retries) {
        throw err
      }
    }
  }

  if (exitErr) {
    throw exitErr
  }

  return output
}

module.exports.retry = retry

class Queue {
  pendingEntries = []

  inFlight = 0

  err = null

  constructor(worker, options = {}) {
    this.worker = worker
    this.concurrency = options.concurrency || 1
  }

  push = (entries) => {
    this.pendingEntries = this.pendingEntries.concat(entries)
    this.process()
  }

  process = () => {
    const scheduled = this.pendingEntries.splice(0, this.concurrency - this.inFlight)
    this.inFlight += scheduled.length
    scheduled.forEach(async (task) => {
      try {
        await this.worker(task)
      }
      catch (err) {
        this.err = err
      }
      finally {
        this.inFlight -= 1
      }

      if (this.pendingEntries.length > 0) {
        this.process()
      }
    })
  }

  wait = (options = {}) =>
    waitUntil(
      () => {
        if (this.err) {
          this.pendingEntries = []
          throw this.err
        }

        return {
          predicate: options.empty
            ? this.inFlight === 0 && this.pendingEntries.length === 0
            : this.concurrency > this.pendingEntries.length,
        }
      },
      {
        delay: 50,
      }
    )
}

module.exports.Queue = Queue
