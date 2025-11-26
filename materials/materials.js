// Material System
class Material {
    constructor(name, color, transparent = false, alpha = 1.0, renderOrder = 0) {
        this.name = name;
        this.color = color;
        this.transparent = transparent;
        this.alpha = alpha;
        this.renderOrder = renderOrder; // 0 = solid, 1 = transparent
    }
}

// Material definitions
const Materials = {
    GRASS: new Grass(),
    DIRT: new Dirt(),
    STONE: new Stone(),
    BEDROCK: new Bedrock(),
    SAND: new Sand(),
    SNOW: new Snow(),
    ICE: new Ice(),
    WATER: new Water(),
    WOOD: new Wood(),
    LEAVES: new Leaves(),
    CACTUS: new Cactus(),
    COAL_ORE: new CoalOre(),
    IRON_ORE: new IronOre(),
    GOLD_ORE: new GoldOre(),
    DIAMOND_ORE: new DiamondOre()
};
