import type { PartSlot } from '../../config';
import type { Part } from './types';

// Rack components, by slot. Within a slot, parts are an upgrade path in the
// order listed and the first is the stock part (free, adds nothing).
// Numbers are what each part adds over stock, per server.
//
// Product names are trademarks of their owners; the game is not affiliated
// with them (shown in-game too). Names only, never logos.
export const PARTS: Part[] = [
  // CPU
  { id: 'cpu_xeon_e5_2620v4', slot: 'cpu', cores: 8, brand: 'Intel', model: 'Xeon E5-2620 v4', specs: '8 cores, 2.1 GHz', level: 1, cost: 0, income: 0, powerDraw: 0, heat: 0 },
  { id: 'cpu_epyc_7302', slot: 'cpu', cores: 16, brand: 'AMD', model: 'EPYC 7302', specs: '16 cores, 3.0 GHz', level: 2, cost: 600, income: 0.5, powerDraw: 0.2, heat: 0.02 },
  { id: 'cpu_xeon_gold_6338', slot: 'cpu', cores: 32, brand: 'Intel', model: 'Xeon Gold 6338', specs: '32 cores, 2.0 GHz', level: 5, cost: 1400, income: 1.1, powerDraw: 0.5, heat: 0.05 },
  { id: 'cpu_epyc_7543', slot: 'cpu', cores: 32, brand: 'AMD', model: 'EPYC 7543', specs: '32 cores, 2.8 GHz', level: 8, cost: 2800, income: 1.8, powerDraw: 0.7, heat: 0.07 },
  { id: 'cpu_epyc_7763', slot: 'cpu', cores: 64, brand: 'AMD', model: 'EPYC 7763', specs: '64 cores, 2.45 GHz', level: 12, cost: 5500, income: 2.8, powerDraw: 1.0, heat: 0.1 },
  { id: 'cpu_xeon_platinum_8480', slot: 'cpu', cores: 56, brand: 'Intel', model: 'Xeon Platinum 8480+', specs: '56 cores, 2.0 GHz', level: 16, cost: 9500, income: 3.8, powerDraw: 1.3, heat: 0.13 },
  { id: 'cpu_epyc_9654', slot: 'cpu', cores: 96, brand: 'AMD', model: 'EPYC 9654', specs: '96 cores, 2.4 GHz', level: 20, cost: 16000, income: 5.2, powerDraw: 1.6, heat: 0.17 },
  { id: 'cpu_epyc_9754', slot: 'cpu', cores: 128, brand: 'AMD', model: 'EPYC 9754', specs: '128 cores, 2.25 GHz', level: 26, cost: 26000, income: 6.8, powerDraw: 1.9, heat: 0.2 },

  // RAM
  { id: 'ram_32gb_ddr4', slot: 'ram', brand: 'Micron', model: '32 GB DDR4-2400 ECC', specs: '32 GB', level: 1, cost: 0, income: 0, powerDraw: 0, heat: 0 },
  { id: 'ram_64gb_ddr4', slot: 'ram', brand: 'Samsung', model: '64 GB DDR4-2933 ECC', specs: '64 GB', level: 3, cost: 400, income: 0.25, powerDraw: 0.05, heat: 0 },
  { id: 'ram_128gb_ddr4', slot: 'ram', brand: 'SK hynix', model: '128 GB DDR4-3200 ECC', specs: '128 GB', level: 6, cost: 1000, income: 0.6, powerDraw: 0.1, heat: 0.01 },
  { id: 'ram_256gb_ddr4', slot: 'ram', brand: 'Samsung', model: '256 GB DDR4-3200 ECC', specs: '256 GB', level: 10, cost: 2400, income: 1.1, powerDraw: 0.2, heat: 0.02 },
  { id: 'ram_512gb_ddr5', slot: 'ram', brand: 'Micron', model: '512 GB DDR5-4800 ECC', specs: '512 GB', level: 15, cost: 5000, income: 1.8, powerDraw: 0.3, heat: 0.03 },
  { id: 'ram_1tb_ddr5', slot: 'ram', brand: 'Samsung', model: '1 TB DDR5-4800 ECC', specs: '1 TB', level: 21, cost: 9500, income: 2.6, powerDraw: 0.4, heat: 0.04 },
  { id: 'ram_2tb_ddr5', slot: 'ram', brand: 'SK hynix', model: '2 TB DDR5-5600 ECC', specs: '2 TB', level: 28, cost: 17000, income: 3.5, powerDraw: 0.5, heat: 0.05 },

  // Storage (SSDs draw less power than the stock hard drives)
  { id: 'sto_hdd_2x1tb', slot: 'storage', brand: 'Seagate', model: 'Exos 7E8 HDD', specs: '2 × 1 TB', level: 1, cost: 0, income: 0, powerDraw: 0, heat: 0 },
  { id: 'sto_hdd_4x2tb', slot: 'storage', brand: 'WD', model: 'Red Pro HDD', specs: '4 × 2 TB', level: 2, cost: 350, income: 0.2, powerDraw: 0.2, heat: 0.02 },
  { id: 'sto_ssd_pm883', slot: 'storage', brand: 'Samsung', model: 'PM883 SATA SSD', specs: '4 × 960 GB', level: 4, cost: 900, income: 0.5, powerDraw: -0.1, heat: -0.01 },
  { id: 'sto_nvme_pm9a3', slot: 'storage', brand: 'Samsung', model: 'PM9A3 NVMe', specs: '4 × 1.92 TB', level: 9, cost: 2200, income: 1.0, powerDraw: 0, heat: 0 },
  { id: 'sto_nvme_7450', slot: 'storage', brand: 'Micron', model: '7450 NVMe', specs: '4 × 3.84 TB', level: 14, cost: 4500, income: 1.6, powerDraw: 0.1, heat: 0.01 },
  { id: 'sto_nvme_pm1743', slot: 'storage', brand: 'Samsung', model: 'PM1743 NVMe', specs: '8 × 7.68 TB', level: 20, cost: 9000, income: 2.4, powerDraw: 0.3, heat: 0.03 },
  { id: 'sto_nvme_d7_p5520', slot: 'storage', brand: 'Solidigm', model: 'D7-P5520 NVMe', specs: '8 × 15.36 TB', level: 27, cost: 16000, income: 3.3, powerDraw: 0.4, heat: 0.04 },

  // Network
  { id: 'net_1g_i350', slot: 'network', brand: 'Intel', model: 'I350', specs: '1 GbE', level: 1, cost: 0, income: 0, powerDraw: 0, heat: 0 },
  { id: 'net_10g_x710', slot: 'network', brand: 'Intel', model: 'X710', specs: '10 GbE', level: 3, cost: 500, income: 0.3, powerDraw: 0, heat: 0 },
  { id: 'net_25g_cx4', slot: 'network', brand: 'Mellanox', model: 'ConnectX-4 Lx', specs: '25 GbE', level: 7, cost: 1300, income: 0.7, powerDraw: 0.05, heat: 0 },
  { id: 'net_100g_cx6', slot: 'network', brand: 'Mellanox', model: 'ConnectX-6', specs: '100 GbE', level: 13, cost: 3200, income: 1.3, powerDraw: 0.15, heat: 0.01 },
  { id: 'net_200g_cx7', slot: 'network', brand: 'NVIDIA', model: 'ConnectX-7', specs: '200 GbE', level: 19, cost: 7000, income: 2.0, powerDraw: 0.25, heat: 0.02 },
  { id: 'net_400g_cx7', slot: 'network', brand: 'NVIDIA', model: 'ConnectX-7 (2 × 200G)', specs: '400 GbE', level: 25, cost: 13000, income: 2.8, powerDraw: 0.35, heat: 0.03 },

  // GPU (GPU compute racks only; the rack's base numbers include the stock T4)
  { id: 'gpu_t4', slot: 'gpu', brand: 'NVIDIA', model: 'T4', specs: '16 GB', level: 22, cost: 0, income: 0, powerDraw: 0, heat: 0 },
  { id: 'gpu_a10', slot: 'gpu', brand: 'NVIDIA', model: 'A10', specs: '24 GB', level: 23, cost: 15000, income: 1.5, powerDraw: 1.5, heat: 0.15 },
  { id: 'gpu_a100', slot: 'gpu', brand: 'NVIDIA', model: 'A100', specs: '80 GB', level: 25, cost: 30000, income: 4, powerDraw: 2.5, heat: 0.3 },
  { id: 'gpu_h100', slot: 'gpu', brand: 'NVIDIA', model: 'H100', specs: '80 GB', level: 28, cost: 60000, income: 8, powerDraw: 5.5, heat: 0.6 },
  { id: 'gpu_mi300x', slot: 'gpu', brand: 'AMD', model: 'Instinct MI300X', specs: '192 GB', level: 32, cost: 100000, income: 12, powerDraw: 6, heat: 0.7 },
  { id: 'gpu_h200', slot: 'gpu', brand: 'NVIDIA', model: 'H200', specs: '141 GB', level: 35, cost: 140000, income: 15, powerDraw: 5.5, heat: 0.7 },
  { id: 'gpu_b200', slot: 'gpu', brand: 'NVIDIA', model: 'B200', specs: '192 GB', level: 40, cost: 220000, income: 22, powerDraw: 8.5, heat: 1 },

  // Rack cooling (removes a share of the whole rack's heat)
  { id: 'cool_air', slot: 'cooling', brand: 'Stock', model: 'Air cooled', specs: 'Server fans', level: 1, cost: 0, income: 0, powerDraw: 0, heat: 0, heatReduction: 0 },
  { id: 'cool_rear_door', slot: 'cooling', brand: 'Vertiv', model: 'Rear-door heat exchanger', specs: '-35% rack heat', level: 12, cost: 3000, income: 0, powerDraw: 0.3, heat: 0, heatReduction: 0.35 },
  { id: 'cool_dlc', slot: 'cooling', brand: 'CoolIT', model: 'Direct liquid cooling', specs: '-60% rack heat', level: 18, cost: 8000, income: 0, powerDraw: 0.5, heat: 0, heatReduction: 0.6 },
  { id: 'cool_immersion', slot: 'cooling', brand: 'Submer', model: 'Immersion cooling', specs: '-85% rack heat', level: 30, cost: 20000, income: 0, powerDraw: 0.8, heat: 0, heatReduction: 0.85 },
];

export const SLOT_NAMES: Record<PartSlot, string> = {
  cpu: 'CPU',
  ram: 'Memory',
  storage: 'Storage',
  network: 'Network',
  gpu: 'GPU',
  cooling: 'Cooling',
};

export const TRADEMARK_NOTE = 'Product names are trademarks of their owners. This game is not affiliated with them.';
