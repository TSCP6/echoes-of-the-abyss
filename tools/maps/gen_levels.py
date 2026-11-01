"""定向重建差异化关卡；先比对目标地图，保留 Tiled 手工编辑。"""
if __package__:
    from .level_layouts import LEVEL_BUILDERS, main
else:
    from level_layouts import LEVEL_BUILDERS, main

if __name__ == "__main__":
    main()
