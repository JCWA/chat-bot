import { Column, Entity, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm'

// embedding 컬럼은 pgvector 타입이라 TypeORM 기본 타입 매핑에서 제외.
// 읽기/쓰기는 raw SQL (dataSource.query) 로 처리.
@Entity({ name: 'medicines' })
export class Medicine {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string

  @Column({ type: 'text', unique: true })
  item_seq: string

  @Column({ type: 'text', nullable: true }) item_name: string | null
  @Column({ type: 'text', nullable: true }) entp_name: string | null
  @Column({ type: 'text', nullable: true }) chart: string | null
  @Column({ type: 'text', nullable: true }) item_image: string | null
  @Column({ type: 'text', nullable: true }) print_front: string | null
  @Column({ type: 'text', nullable: true }) print_back: string | null
  @Column({ type: 'text', nullable: true }) drug_shape: string | null
  @Column({ type: 'text', nullable: true }) color_class1: string | null
  @Column({ type: 'text', nullable: true }) color_class2: string | null
  @Column({ type: 'text', nullable: true }) line_front: string | null
  @Column({ type: 'text', nullable: true }) line_back: string | null
  @Column({ type: 'text', nullable: true }) leng_long: string | null
  @Column({ type: 'text', nullable: true }) leng_short: string | null
  @Column({ type: 'text', nullable: true }) thick: string | null
  @Column({ type: 'text', nullable: true }) form_code_name: string | null
  @Column({ type: 'text', nullable: true }) class_name: string | null
  @Column({ type: 'text', nullable: true }) etc_otc_name: string | null
  @Column({ type: 'text', nullable: true }) efcy: string | null
  @Column({ type: 'text', nullable: true }) use_method: string | null
  @Column({ type: 'text', nullable: true }) side_effect: string | null
  @Column({ type: 'text', nullable: true }) atpn: string | null
  @Column({ type: 'text', nullable: true }) intrc: string | null
  @Column({ type: 'text', nullable: true }) deposit_method: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
