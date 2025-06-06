import { Router } from 'express';
import * as adminOrderController from '../../controllers/admin-order.controller';
import authMiddleware from '../../middleware/auth.middleware';
import helpersMiddleware from '../../middleware/helpers.middleware';
import { wrapAsync } from '../../utils/response';

const router = Router();

/**
 * [Get all orders]
 * @route admin/orders
 * @method get
 */
router.get(
    '/',
    authMiddleware.verifyAccessToken,
    authMiddleware.verifyAdmin,
    wrapAsync(adminOrderController.listOrders)
);

/**
 * [Get order detail]
 * @param id: mongoId
 * @route admin/orders/:id
 * @method get
 */
router.get(
    '/:id',
    authMiddleware.verifyAccessToken,
    authMiddleware.verifyAdmin,
    helpersMiddleware.idValidator,
    wrapAsync(adminOrderController.getOrderDetail)
);

/**
 * [Update order]
 * @param id: mongoId
 * @route admin/orders/:id
 * @method put
 */
router.put(
    '/:id',
    authMiddleware.verifyAccessToken,
    authMiddleware.verifyAdmin,
    helpersMiddleware.idValidator,
    wrapAsync(adminOrderController.updateOrder)
);

/**
 * [Delete order]
 * @param id: mongoId
 * @route admin/orders/:id
 * @method delete
 */
router.delete(
    '/:id',
    authMiddleware.verifyAccessToken,
    authMiddleware.verifyAdmin,
    helpersMiddleware.idValidator,
    wrapAsync(adminOrderController.deleteOrder)
);

export default router;