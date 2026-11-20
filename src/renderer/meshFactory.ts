/**
 * Thin backward-compatible barrel re-exporting all 3D procedural asset builders,
 * material/geometry/texture pools, and disposal helpers.
 */
export {
  GeometryPool,
  MaterialPool,
  TextureFactory,
  createRoundedBoxGeometry,
  disposeObjectTree,
  type DisposeTreeOptions,
  type TexturedMaterialOptions,
} from './materialLibrary';

export {
  buildEnvironmentGroup,
  buildEnvironmentRig,
  getVenueEnvironmentTheme,
  resolveTipVisualZ,
  syncDynamicTables,
  type EnvironmentAnimatedProp,
  type EnvironmentVisualRig,
  type PassDishSlotHandle,
  type TableVisualHandle,
  type VenueEnvironmentTheme,
} from './environmentBuilder';

export {
  buildStationRig,
  syncStationMachineLayout,
  type StationVisualRig,
} from './stationBuilder';

export {
  ALL_HAIR_STYLES,
  ALL_PET_MODEL_STYLES,
  RARITY_SHIMMER_PALETTE,
  SKIN_TONE_PALETTE,
  applyEquippedGearVisuals,
  buildCharacterRig,
  buildDriveThruCar,
  buildDriveThruCarRig,
  buildFoodDishMesh,
  buildPetRig,
  buildTipCoinStack,
  restyleCustomerRig,
  restyleDriveThruCar,
  setTrayDishVisual,
  type CharacterBuildOptions,
  type CharacterRig,
  type CustomerRestyleOptions,
  type DriveThruCarRig,
  type EquippedGearVisualSet,
  type HairStyleId,
  type PetModelStyle,
  type PetVisualRig,
  type StationModelStyle,
} from './characterBuilder';
