import express from 'express'
import cors from 'cors'
import chalk from 'chalk'
import helmet from 'helmet'
import { connectMongoDB } from './database/database'
import adminRoutes from './routes/admin/index.route'
import commonRoutes from './routes/common/index.route'
import userRoutes from './routes/user/index.route'
import { responseError } from './utils/response'
import { FOLDERS, FOLDER_UPLOAD, ROUTE_IMAGE } from './constants/config'
import path from 'path'
import { isProduction } from './utils/helper'
require('dotenv').config()

const app: express.Application = express()
connectMongoDB()
const routes = [{ ...commonRoutes }, { ...userRoutes }, { ...adminRoutes }]
app.use(helmet())
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

const dirNameWithEnv = isProduction ? path.dirname(__dirname) : __dirname
console.log('Directory path:', dirNameWithEnv)
console.log('Upload folder path:', path.join(dirNameWithEnv, `/${FOLDER_UPLOAD}`))

// Check if files exist
const fs = require('fs')
const uploadPath = path.join(dirNameWithEnv, `/${FOLDER_UPLOAD}`)
console.log('Upload directory exists:', fs.existsSync(uploadPath))
if (fs.existsSync(uploadPath)) {
  console.log('Files in upload directory:', fs.readdirSync(uploadPath))
}


const handlerImage: any = Object.values(FOLDERS).reduce(
  (result: any, current: any) => {
    return [
      ...result,
      express.static(path.join(dirNameWithEnv, `/${FOLDER_UPLOAD}/${current}`)),
    ]
  },
  [express.static(path.join(dirNameWithEnv, `/${FOLDER_UPLOAD}`))]
)

app.use(`/${ROUTE_IMAGE}`, ...handlerImage)

routes.forEach((item) =>
  item.routes.forEach((route) => app.use(item.prefix + route.path, route.route))
)
app.use(function (err: any, req: any, res: any, next: any) {
  responseError(res, err)
})

app.listen(process.env.PORT, function () {
  console.log(chalk.greenBright(`API listening on port ${process.env.PORT}!`))
})
