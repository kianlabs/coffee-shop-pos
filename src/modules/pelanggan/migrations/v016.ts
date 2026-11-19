import { UPGRADE_V16 } from "@/data/migrations";
import type { MigrationStep } from "@/domain/migration";
const step: MigrationStep = { version: 16, statements: UPGRADE_V16 };
export default step;
