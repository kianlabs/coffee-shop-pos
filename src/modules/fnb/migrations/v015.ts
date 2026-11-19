import { UPGRADE_V15 } from "@/data/migrations";
import type { MigrationStep } from "@/domain/migration";
const step: MigrationStep = { version: 15, statements: UPGRADE_V15 };
export default step;
