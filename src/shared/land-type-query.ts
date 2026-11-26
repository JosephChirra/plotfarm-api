import type { Prisma } from '@prisma/client';
import { PropertyType } from '@prisma/client';
import type { PrismaService } from '../core/database/prisma.service';

/** Map PropertyCategory.name to Property.propertyType for OR filters. */
export function propertyTypeFromCategoryName(name: string): PropertyType | undefined {
  const n = name.toUpperCase().replace(/\s+/g, '_');
  if (n === 'PLOT' || /\bPLOT\b/.test(n)) return PropertyType.PLOT;
  if (n === 'FARM_LAND' || n.includes('FARM')) return PropertyType.FARM_LAND;
  return undefined;
}

export async function resolvePropertyTypeForCategoryId(
  prisma: PrismaService,
  categoryId: number,
): Promise<PropertyType | undefined> {
  const cat = await prisma.propertyCategory.findUnique({
    where: { id: categoryId },
    select: { name: true },
  });
  return cat?.name ? propertyTypeFromCategoryName(cat.name) : undefined;
}

/** Posts with this category id OR legacy rows with null category but matching propertyType. */
export function landTypeMatchWhere(
  categoryId: number,
  propertyType: PropertyType,
): Prisma.PropertyWhereInput {
  return {
    OR: [
      { categoryId },
      { AND: [{ categoryId: null }, { propertyType }] },
    ],
  };
}
