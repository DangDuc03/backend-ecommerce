import commonAuthRouter from './common-auth.route'
import commonProductRouter from './common-product.route'
import commonUserRouter from './common-user.route'
import commonCategoryRouter from './common-category.route'
import commonChatbotRouter from './common-chatbot.route'

const commonRoutes = {
  prefix: '/',
  routes: [
    {
      path: 'products',
      route: commonProductRouter,
    },
    {
      path: 'categories',
      route: commonCategoryRouter,
    },
    {
      path: '',
      route: commonAuthRouter,
    },
    {
      path: '',
      route: commonUserRouter,
    },
    {
      path: '',
      route: commonChatbotRouter,
    },
  ],
}

export default commonRoutes
