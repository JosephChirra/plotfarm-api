import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';

@Injectable()
export class PropertyFavoritesService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, propertyId: string) {
    const existing = await this.prisma.propertyFavorite.findUnique({
      where: { userId_propertyId: { userId, propertyId } },
    });
    if (existing) throw new ConflictException('Already in favorites');
    return this.prisma.propertyFavorite.create({
      data: { userId, propertyId },
      include: { user: true, property: true },
    });
  }

  async findAll(userId?: string) {
    const where = userId ? { userId } : {};
    return this.prisma.propertyFavorite.findMany({
      where,
      include: { user: true, property: true },
    });
  }

  async findOne(userId: string, propertyId: string) {
    const fav = await this.prisma.propertyFavorite.findUnique({
      where: { userId_propertyId: { userId, propertyId } },
      include: { user: true, property: true },
    });
    if (!fav) throw new NotFoundException('Favorite not found');
    return fav;
  }

  async remove(userId: string, propertyId: string) {
    await this.findOne(userId, propertyId);
    return this.prisma.propertyFavorite.delete({
      where: { userId_propertyId: { userId, propertyId } },
    });
  }
}
