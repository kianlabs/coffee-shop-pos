import { UPGRADE_V17 } from "@/data/migrations";
import type { MigrationStep } from "@/domain/migration";
const step: MigrationStep = { version: 17, statements: UPGRADE_V17 };
export default step;
