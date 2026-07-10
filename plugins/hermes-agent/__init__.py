try:
    from .adapter import register
    from . import outbound, tools
except ImportError:
    from adapter import register
    import outbound
    import tools

__all__ = ["register", "outbound", "tools"]
