const packageName = 'country-flag-icons'
const distName = 'country-flag-icons'
const iconSetName = 'Country Flag Icons'
const prefix = 'flag'
const iconPath = '3x2'
const svgPath = '/*.svg'

// ------------

const glob = require('glob')
const { copySync } = require('fs-extra')
const { resolve } = require('path')

const start = new Date()

const skipped = []
const distFolder = resolve(__dirname, `../${ distName }`)
const { defaultNameMapper, extract, writeExports } = require('./utils')

const svgFolder = resolve(__dirname, `../../node_modules/${ packageName }/${ iconPath }/`)
const svgFiles = glob.sync(svgFolder + svgPath)
const iconNames = new Set()

const svgExports = []
const typeExports = []

// Some flag paths have nofill - they assume black
const stylesFilter = strAttributes => {
  if (strAttributes.indexOf('fill:') === -1) { // no fill
    return strAttributes + 'fill:#000'
  }
  return strAttributes
}

svgFiles.forEach(file => {
  const name = defaultNameMapper(file, prefix)

  if (iconNames.has(name) || name === 'flagKR') {
    return
  }

  try {
    const { svgDef, typeDef } = extract(file, name, { stylesFilter })
    svgExports.push(svgDef)
    typeExports.push(typeDef)

    iconNames.add(name)
  }
  catch(err) {
    console.error(err)
    skipped.push(name)
  }
})

writeExports(iconSetName, packageName, distFolder, svgExports, typeExports, skipped)

copySync(
  resolve(__dirname, `../../node_modules/${ packageName }/LICENSE`),
  resolve(__dirname, `../${ distName }/LICENSE.md`)
)

const end = new Date()

console.log(`${ iconSetName } done (${ end - start }ms)`)
