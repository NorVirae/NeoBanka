import LabelTerminal from "./label-terminal"



export const AssetList = ({asset, setAsset, label, assetList=["HBAR", "USDT", "xZAR", "cNGN"]}) => {
    return (
        <div>
            <LabelTerminal htmlFor="base-asset" className="text-sm">{label}</LabelTerminal>
            <select
                id="base-asset"
                value={asset}
                onChange={(e) => setAsset(e.target.value)}
                className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm"
            >
                {assetList.map((item) => (
                    <option key={item} value={item}>
                        {item}
                    </option>
                ))}
            </select>
        </div>
    )
}
