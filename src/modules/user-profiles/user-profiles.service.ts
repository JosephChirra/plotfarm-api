import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { CreateUserProfileDto } from './dto/create-user-profile.dto';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';

@Injectable()
export class UserProfilesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateUserProfileDto) {
    const existing = await this.prisma.userProfile.findUnique({
      where: { userId: dto.userId },
    });
    if (existing) throw new ConflictException('Profile already exists for this user');
    return this.prisma.userProfile.create({ data: dto as never });
  }

  async findAll() {
    return this.prisma.userProfile.findMany({ include: { user: true } });
  }

  async findOne(id: string) {
    const profile = await this.prisma.userProfile.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!profile) throw new NotFoundException('Profile not found');
    return profile;
  }

  async findByUserId(userId: string) {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
      include: { user: true },
    });
    if (!profile) throw new NotFoundException('Profile not found');
    return profile;
  }

  async update(id: string, dto: UpdateUserProfileDto) {
    await this.findOne(id);
    return this.prisma.userProfile.update({
      where: { id },
      data: dto as never,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.userProfile.delete({ where: { id } });
  }
}
