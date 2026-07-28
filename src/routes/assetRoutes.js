import express from 'express';
import * as assetController from '../controllers/assetController.js';
import { protect, authorize } from '../middleware/auth.js';
import { STAFF_ROLES, MANAGEMENT_ROLES, HR_ADMIN } from '../constants/roles.js';

const router = express.Router();
router.use(protect);

router.get('/me', authorize(...STAFF_ROLES), assetController.myAssets);
router.get('/team', authorize(...MANAGEMENT_ROLES), assetController.teamAssets);
router.post('/assign', authorize(...MANAGEMENT_ROLES), assetController.assignAsset);
router.patch('/assignments/:id/return-request', authorize(...STAFF_ROLES), assetController.requestReturn);
router.patch('/assignments/:id/return', authorize(...HR_ADMIN), assetController.confirmReturn);
router.get('/', authorize(...STAFF_ROLES), assetController.listAssets);
router.post('/', authorize(...HR_ADMIN), assetController.createAsset);
router.patch('/:id', authorize(...HR_ADMIN), assetController.updateAsset);

export default router;
