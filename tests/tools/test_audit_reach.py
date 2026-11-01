"""实际 Tiled 地图审计的行为回归；不依赖生成器。"""
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from tools.maps.audit_reach import audit_map, load_physics, make_target, target_hit


def fixture(width=30, height=20):
    layers = [{"name": name, "type": "tilelayer", "width": width,
               "height": height, "encoding": "csv", "data": [0] * (width * height)}
              for name in ("collision", "oneway")]
    layers += [{"name": name, "type": "objectgroup", "objects": []}
               for name in ("spawn", "goal", "shards", "checkpoints", "hazards")]
    return {"width": width, "height": height, "tilewidth": 32, "tileheight": 32,
            "orientation": "orthogonal", "layers": layers,
            "tilesets": [{"firstgid": 1, "tiles": [
                {"id": 0, "properties": [{"name": "solid", "value": True}]}]}]}


def layer(raw, name):
    return next(item for item in raw["layers"] if item["name"] == name)


def rect(raw, x0, y0, x1, y1, name="collision", gid=1):
    data = layer(raw, name)["data"]
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            data[y * raw["width"] + x] = gid


def objectives(raw, goal_x=800, floor_y=512, shards=None):
    layer(raw, "spawn")["objects"] = [{"name": "player_spawn", "x": 48,
                                         "y": floor_y - 64}]
    layer(raw, "goal")["objects"] = [{"name": "goal", "x": goal_x,
                                        "y": floor_y - 96, "width": 64, "height": 96}]
    layer(raw, "shards")["objects"] = shards or [
        {"name": f"shard_{n}", "x": 64 + n * 32, "y": floor_y - 32}
        for n in range(3)]
    layer(raw, "checkpoints")["objects"] = [
        {"name": f"cp_{n}", "x": 96 + n * 32, "y": floor_y - 32}
        for n in range(2)]


class AuditReachTests(unittest.TestCase):
    def reward_map(self, name, x, y, count=5):
        raw = fixture()
        rect(raw, 0, 16, 29, 19)
        objectives(raw)
        raw["layers"].append({"name": "pickups", "type": "objectgroup", "objects": [
            {"name": name, "x": x, "y": y,
             "properties": [{"name": "count", "value": str(count)}]}]})
        return raw

    def test_chest_requires_reachable_standing_interaction(self):
        report = audit_map(self.reward_map("chest_1", 400, 100))
        self.assertFalse(report["ok"])
        self.assertFalse(report["routes"]["chests"][0]["reachable"])

    def test_chest_embedded_in_solid_fails_even_if_interaction_is_close(self):
        report = audit_map(self.reward_map("chest_1", 400, 520))
        self.assertTrue(any("嵌入" in error for error in report["errors"]))

    def test_coins_check_all_spawn_offsets_including_upper_row(self):
        raw = self.reward_map("coin_cluster_1", 400, 480)
        rect(raw, 12, 14, 12, 14)
        report = audit_map(raw)
        self.assertTrue(any("金币" in error and "嵌入" in error for error in report["errors"]))
        self.assertEqual(len(report["routes"]["coins"]), 5)

    def test_coin_magnet_rejects_square_corner_and_uses_sprite_foot_offset(self):
        physics = load_physics()
        target = make_target({"name": "coin_cluster_1/1", "x": 300, "y": 300}, "coin")
        self.assertTrue(target_hit(target, 390, 332, physics))
        self.assertFalse(target_hit(target, 390, 422, physics))
        self.assertFalse(target_hit(target, 396, 332, physics))

    def test_coin_magnet_is_a_circle_in_sprite_coordinates(self):
        raw = self.reward_map("coin_cluster_1", 400, 300, 1)
        rect(raw, 0, 13, 29, 13)
        report = audit_map(raw)
        self.assertFalse(report["routes"]["coins"][0]["reachable"])
        self.assertFalse(report["ok"])

    def test_clear_rewards_have_routes_and_standing_chest_interaction_step(self):
        raw = self.reward_map("chest_1", 400, 480)
        layer(raw, "pickups")["objects"].append({"name": "coin_cluster_1", "x": 450, "y": 480})
        report = audit_map(raw)
        self.assertTrue(report["ok"], report["errors"])
        self.assertTrue(all(route["reachable"] for route in report["routes"]["coins"]))
        chest = report["routes"]["chests"][0]
        self.assertEqual(chest["steps"][-1]["kind"], "interact")

    def gate_reward_map(self, switch_x=200, switch_y=480):
        raw = self.reward_map("chest_1", 800, 480)
        layer(raw, "pickups")["objects"].append({"name": "coin_cluster_1", "x": 760, "y": 480})
        raw["layers"].append({"name": "mechanisms", "type": "objectgroup", "objects": [
            {"name": "rune_1", "type": "switch", "x": switch_x, "y": switch_y,
             "properties": [{"name": "group", "value": "test"}]},
            {"name": "gate_1", "type": "gate", "x": 480, "y": 128, "width": 32, "height": 384,
             "properties": [{"name": "group", "value": "test"}]}]})
        return raw

    def test_reward_route_opens_gate_before_walking_on_same_long_surface(self):
        report = audit_map(self.gate_reward_map())
        for route in [*report["routes"]["chests"], *report["routes"]["coins"]]:
            self.assertTrue(route["reachable"])
            interactions = [step["objective"] for step in route["steps"] if step["kind"] == "interact"]
            self.assertEqual(interactions[0], "rune_1")
            if route["kind"] == "chest": self.assertEqual(interactions[-1], "chest_1")

    def test_rewards_behind_gate_fail_when_the_switch_is_unreachable(self):
        report = audit_map(self.gate_reward_map(switch_y=64))
        self.assertFalse(report["routes"]["chests"][0]["reachable"])
        self.assertFalse(report["routes"]["coins"][0]["reachable"])

    def test_switch_behind_its_own_gate_cannot_unlock_reward_route(self):
        report = audit_map(self.gate_reward_map(switch_x=650))
        self.assertFalse(report["routes"]["chests"][0]["reachable"])

    def test_reward_route_obeys_ordered_switch_interactions(self):
        raw = self.gate_reward_map(switch_x=300)
        switch = layer(raw, "mechanisms")["objects"][0]
        switch["properties"].append({"name": "order", "value": "1"})
        layer(raw, "mechanisms")["objects"].insert(0, {"name": "rune_2", "type": "switch", "x": 150, "y": 480,
            "properties": [{"name": "group", "value": "test"}, {"name": "order", "value": "2"}]})
        route = audit_map(raw)["routes"]["chests"][0]
        self.assertEqual([step["objective"] for step in route["steps"] if step["kind"] == "interact"],
                         ["rune_1", "rune_2", "chest_1"])

    def test_gate_blocks_flight_between_separate_platforms_until_switch_is_reachable(self):
        raw = self.gate_reward_map(switch_y=64)
        data = layer(raw, "collision")["data"]
        for y in range(16, 20):
            for x in range(10, 14): data[y * raw["width"] + x] = 0
        gate = layer(raw, "mechanisms")["objects"][1]
        gate["x"] = 400
        closed = audit_map(raw)
        self.assertTrue(closed["routes"]["goal"]["reachable"])
        self.assertFalse(closed["routes"]["chests"][0]["reachable"])
        layer(raw, "mechanisms")["objects"][0]["y"] = 480
        opened = audit_map(raw)["routes"]["chests"][0]
        self.assertTrue(opened["reachable"])
        self.assertEqual(next(step["objective"] for step in opened["steps"] if step["kind"] == "interact"), "rune_1")

    def test_reward_before_gate_does_not_require_unrelated_switch(self):
        raw = self.gate_reward_map(switch_y=64)
        layer(raw, "pickups")["objects"][0]["x"] = 200
        route = audit_map(raw)["routes"]["chests"][0]
        self.assertTrue(route["reachable"])
        self.assertEqual([step["objective"] for step in route["steps"] if step["kind"] == "interact"], ["chest_1"])

    def test_motion_and_body_numbers_come_from_the_config_not_comments(self):
        with TemporaryDirectory(dir=Path(__file__).parent) as directory:
            path = Path(directory) / "defaults.ts"
            path.write_text("// gravity: 9999\nexport const d = {gravity: 1040, jumpVelocity: 400, "
                            "walkSpeed: 180, accelTimeSec: 0.2, airControlFactor: 0.5, "
                            "collider: {w: 19, h: 41}};", encoding="utf-8")
            physics = load_physics(path)
        self.assertEqual((physics.gravity, physics.jumpVelocity, physics.walkSpeed), (1040, 400, 180))
        self.assertEqual((physics.width, physics.height, physics.air_accel), (19, 41, 450))

    def test_actual_solid_wall_blocks_goal(self):
        raw = fixture()
        rect(raw, 0, 16, 29, 19)
        rect(raw, 12, 5, 13, 15)
        objectives(raw)
        report = audit_map(raw)
        self.assertFalse(report["routes"]["goal"]["reachable"])
        self.assertTrue(any("终点" in item for item in report["errors"]))

    def test_pit_wider_than_full_jump_is_unreachable(self):
        raw = fixture()
        rect(raw, 0, 16, 7, 19)
        rect(raw, 18, 16, 29, 19)
        objectives(raw)
        report = audit_map(raw)
        self.assertFalse(report["routes"]["goal"]["reachable"])

    def test_stairs_and_safe_lower_landing_are_reachable(self):
        raw = fixture()
        rect(raw, 0, 16, 7, 19)
        rect(raw, 8, 14, 14, 19)
        rect(raw, 15, 12, 20, 19)
        rect(raw, 21, 16, 29, 19)
        objectives(raw)
        report = audit_map(raw)
        self.assertTrue(report["ok"], report["errors"])
        self.assertTrue(any(edge["landing"]["y"] < edge["launch"]["y"]
                            for edge in report["routes"]["goal"]["steps"]
                            if edge["kind"] == "jump"))

    def test_oneway_can_be_entered_from_below(self):
        raw = fixture()
        rect(raw, 0, 16, 29, 19)
        rect(raw, 2, 13, 6, 13, name="oneway")
        objectives(raw, shards=[{"name": "shard_a", "x": 128, "y": 336},
                               {"name": "shard_b", "x": 128, "y": 480},
                               {"name": "shard_c", "x": 160, "y": 480}])
        report = audit_map(raw)
        self.assertTrue(report["ok"], report["errors"])
        self.assertTrue(report["routes"]["shards"][0]["reachable"])
        self.assertTrue(any(edge["kind"] == "jump" for edge in
                            report["routes"]["shards"][0]["steps"]))

    def test_unreachable_required_shard_fails_even_when_goal_is_reachable(self):
        raw = fixture()
        rect(raw, 0, 16, 29, 19)
        objectives(raw, shards=[{"name": "shard_a", "x": 128, "y": 96},
                               {"name": "shard_b", "x": 128, "y": 480},
                               {"name": "shard_c", "x": 160, "y": 480}])
        report = audit_map(raw)
        self.assertTrue(report["routes"]["goal"]["reachable"])
        self.assertFalse(report["routes"]["shards"][0]["reachable"])
        self.assertFalse(report["ok"])

    def test_unreachable_decorative_platform_is_not_required(self):
        raw = fixture()
        rect(raw, 0, 16, 29, 19)
        rect(raw, 15, 3, 17, 3, name="oneway")
        objectives(raw)
        report = audit_map(raw)
        self.assertTrue(report["ok"], report["errors"])

    def test_low_solid_ceiling_blocks_a_jump(self):
        raw = fixture()
        rect(raw, 0, 16, 7, 19)
        rect(raw, 12, 16, 29, 19)
        rect(raw, 0, 13, 16, 13)
        objectives(raw)
        report = audit_map(raw)
        self.assertFalse(report["routes"]["goal"]["reachable"])

    def test_collision_gid_without_solid_is_not_a_floor(self):
        raw = fixture()
        rect(raw, 0, 16, 29, 19, gid=2)
        objectives(raw)
        report = audit_map(raw)
        self.assertFalse(report["ok"])
        self.assertTrue(any("出生" in item for item in report["errors"]))

    def test_spawn_has_loader_offset_and_body_foot_offset(self):
        raw = fixture()
        rect(raw, 0, 16, 29, 19)
        objectives(raw)
        report = audit_map(raw)
        self.assertEqual(report["spawn"]["sprite"], {"x": 64.0, "y": 464.0})
        self.assertEqual(report["spawn"]["foot"], {"x": 64.0, "y": 496.0})

    def test_high_branches_can_return_to_a_long_lower_floor(self):
        raw = fixture(width=110)
        rect(raw, 0, 16, 109, 19)
        rect(raw, 20, 13, 27, 13, name="oneway")
        rect(raw, 50, 13, 57, 13, name="oneway")
        objectives(raw, goal_x=3200, shards=[
            {"name": "shard_a", "x": 768, "y": 384},
            {"name": "shard_b", "x": 1728, "y": 384},
            {"name": "shard_c", "x": 3000, "y": 480}])
        report = audit_map(raw)
        self.assertTrue(report["ok"], report["errors"])
        self.assertTrue(report["routes"]["main"]["reachable"])

    def test_separate_one_way_branches_cannot_fake_an_all_shard_route(self):
        raw = fixture()
        rect(raw, 12, 4, 17, 4, name="oneway")
        rect(raw, 0, 16, 11, 19)
        rect(raw, 18, 16, 29, 19)
        objectives(raw, shards=[{"name": "shard_a", "x": 256, "y": 480},
                               {"name": "shard_b", "x": 704, "y": 480},
                               {"name": "shard_c", "x": 480, "y": 96}])
        layer(raw, "spawn")["objects"] = [{"name": "player_spawn", "x": 448, "y": 64}]
        report = audit_map(raw)
        self.assertTrue(report["routes"]["goal"]["reachable"])
        self.assertTrue(all(item["reachable"] for item in report["routes"]["shards"]))
        self.assertFalse(report["routes"]["main"]["reachable"])

    def test_death_plane_blocks_body_even_without_solid_tiles(self):
        raw = fixture()
        rect(raw, 0, 16, 29, 19)
        objectives(raw)
        layer(raw, "hazards")["objects"] = [{"name": "death_barrier", "type": "death_plane",
                                              "x": 384, "y": 0, "width": 32, "height": 640}]
        report = audit_map(raw)
        self.assertFalse(report["routes"]["goal"]["reachable"])

    def test_main_visits_ordered_switches_and_lists_gate_requirements(self):
        raw = fixture()
        rect(raw, 0, 16, 29, 19)
        objectives(raw)
        switches = [{"name": f"rune_{order}", "type": "switch", "x": x, "y": 480,
                     "properties": [{"name": "group", "value": "stars"},
                                    {"name": "order", "value": str(order)}]}
                    for order, x in [(3, 700), (1, 600), (2, 300)]]
        gate = {"name": "gate_a", "type": "gate", "x": 768, "y": 384,
                "width": 32, "height": 128,
                "properties": [{"name": "group", "value": "stars"}]}
        raw["layers"].append({"name": "mechanisms", "type": "objectgroup", "objects": [*switches, gate]})
        report = audit_map(raw)
        self.assertTrue(report["ok"], report["errors"])
        self.assertEqual([step["objective"] for step in report["routes"]["main"]["steps"]
                          if step["kind"] == "interact"], ["rune_1", "rune_2", "rune_3"])
        self.assertEqual(report["mechanisms"]["gates"][0]["switches"], ["rune_1", "rune_2", "rune_3"])

    def test_crumble_has_a_static_top_and_explicit_timing_caveat(self):
        raw = fixture()
        rect(raw, 0, 16, 6, 19)
        rect(raw, 20, 16, 29, 19)
        objectives(raw, shards=[{"name": "shard_a", "x": 416, "y": 416},
                               {"name": "shard_b", "x": 96, "y": 480},
                               {"name": "shard_c", "x": 128, "y": 480}])
        raw["layers"].append({"name": "mechanisms", "type": "objectgroup", "objects": [
            {"name": "bridge", "class": "crumble", "x": 320, "y": 448, "width": 192, "height": 16}]})
        report = audit_map(raw)
        self.assertTrue(report["ok"], report["errors"])
        self.assertTrue(any(step.get("quickDeparture") for step in report["routes"]["main"]["steps"]))
        self.assertEqual(report["mechanisms"]["crumble"][0]["id"], "bridge")

    def test_oneway_split_by_a_solid_obstacle_has_independent_safe_standing_ranges(self):
        raw = fixture()
        rect(raw, 0, 16, 29, 19)
        rect(raw, 2, 13, 20, 13, name="oneway")
        rect(raw, 10, 12, 12, 12)
        objectives(raw, goal_x=550)
        layer(raw, "goal")["objects"][0].update({"y": 320, "height": 96})
        report = audit_map(raw)
        self.assertTrue(report["routes"]["goal"]["reachable"])


if __name__ == "__main__":
    unittest.main()
