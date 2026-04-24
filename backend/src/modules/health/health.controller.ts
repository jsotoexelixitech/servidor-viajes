import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import {
  HealthCheck, HealthCheckService, TypeOrmHealthIndicator, MemoryHealthIndicator,
  DiskHealthIndicator,
} from '@nestjs/terminus';
import { LaMundialService } from '../seguro/lamundial.service';
import { ConfigService } from '@nestjs/config';
import * as os from 'os';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
    private readonly disk: DiskHealthIndicator,
    private readonly laMundialService: LaMundialService,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Health check completo (BD + memoria + disco + circuit breaker La Mundial)' })
  async check() {
    const baseUrl = this.configService.get<string>('webhook.url') || 'https://qaapisys2000.lamundialdeseguros.com';
    const circuit = await this.laMundialService.getCircuitStatus(baseUrl);

    // Directorio de logs o raíz según OS
    const diskPath = os.platform() === 'win32' ? 'C:\\' : '/';

    const result = await this.health.check([
      () => this.db.pingCheck('database', { timeout: 5000 }),
      () => this.memory.checkHeap('memory_heap', 500 * 1024 * 1024),
      () => this.memory.checkRSS('memory_rss', 1024 * 1024 * 1024),
      // Alerta si el disco supera el 90% de uso
      () => this.disk.checkStorage('disk_storage', { thresholdPercent: 0.9, path: diskPath }),
    ]);

    return {
      ...result,
      laMundial: {
        circuitBreaker: circuit.state,
        failures: circuit.failures,
        status: circuit.state === 'CLOSED' ? 'up' : circuit.state === 'HALF_OPEN' ? 'recovering' : 'down',
      },
    };
  }
}
