import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { CreatePropertyFeatureMappingDto } from './dto/create-property-feature-mapping.dto';

@Injectable()
export class PropertyFeatureMappingService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreatePropertyFeatureMappingDto) {
    return this.prisma.propertyFeatureMapping.create({
      data: dto as never,
      include: { property: true, feature: true },
    });
  }

  async findAll(propertyId?: string, featureId?: number) {
    const where: Record<string, unknown> = {};
    if (propertyId) where.propertyId = propertyId;
    if (featureId) where.featureId = featureId;
    return this.prisma.propertyFeatureMapping.findMany({
      where,
      include: { property: true, feature: true },
    });
  }

  async findOne(propertyId: string, featureId: number) {
    const m = await this.prisma.propertyFeatureMapping.findUnique({
      where: { propertyId_featureId: { propertyId, featureId } },
      include: { property: true, feature: true },
    });
    if (!m) throw new NotFoundException('Mapping not found');
    return m;
  }

  async remove(propertyId: string, featureId: number) {
    await this.findOne(propertyId, featureId);
    return this.prisma.propertyFeatureMapping.delete({
      where: { propertyId_featureId: { propertyId, featureId } },
    });
  }
}
