interface MenuHeaderProps {
  productCount: number;
}

export function MenuHeader({ productCount }: MenuHeaderProps) {
  return (
    <div>
      <h2 className="text-lg font-semibold">
        Daftar menu{" "}
        <span className="font-normal text-muted-foreground tabular-nums">({productCount})</span>
      </h2>
      <p className="text-sm text-muted-foreground">
        Isi sendiri nama menu dan harganya. Menu yang tidak dijual lagi bisa dihapus, riwayat
        transaksi lama tetap utuh.
      </p>
    </div>
  );
}
