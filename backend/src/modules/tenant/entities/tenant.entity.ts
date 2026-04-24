import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100 })
  nombre: string;

  /** API key única usada para autenticar al tenant en cada request */
  @Index({ unique: true })
  @Column({ name: 'api_key', type: 'varchar', length: 128 })
  apiKey: string;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @Column({ name: 'webhook_url', type: 'varchar', length: 500, nullable: true })
  webhookUrl: string;

  @Column({ name: 'webhook_secret', type: 'varchar', length: 256, nullable: true })
  webhookSecret: string;

  /** Límite de peticiones por minuto, null = usa el global */
  @Column({ name: 'rate_limit', type: 'int', nullable: true })
  rateLimit: number;

  @Column({ type: 'jsonb', nullable: true })
  config: Record<string, any>;

  @CreateDateColumn({ name: 'creado_en' })
  creadoEn: Date;

  @UpdateDateColumn({ name: 'actualizado_en' })
  actualizadoEn: Date;
}
